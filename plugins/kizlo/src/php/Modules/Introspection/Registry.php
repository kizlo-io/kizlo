<?php

namespace Kizlo\Modules\Introspection;

/**
 * Assembles the introspection document.
 *
 * Collects schemas and routes from the two contribution hooks, adds core and
 * managed-content entries, merges what is identical, rejects what conflicts,
 * validates every reference and then sorts the result so unchanged configuration
 * serializes byte-for-byte the same.
 *
 * Both hooks carry lists rather than maps on purpose: a map keyed by ID lets one
 * filter callback silently overwrite another's entry, where a list forces a
 * duplicate to surface as either an identical merge or a reported conflict.
 */
class Registry
{
    /**
     * Every introspected route resolves its `$ref`s against this while its
     * arguments are built, so a request with forty of them asked for it forty
     * times and rebuilt it each time. Nothing can contribute between two of
     * those calls: registration is over by `rest_api_init`.
     *
     * @var array<string, array<string, mixed>>|null
     */
    private static ?array $schemaMap = null;

    /**
     * The registered schema map, unvalidated.
     *
     * Runtime arg translation needs the same map the document is built from, but
     * needs it at `rest_api_init` — long before anything asks for `/introspect`.
     * Conflicts and unknown references are the document's problem; here, a later
     * registration simply wins.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function schemaMap(): array
    {
        if (self::$schemaMap !== null) {
            return self::$schemaMap;
        }

        $schemas = CoreSchemas::all() + ManagedContent::schemas();

        /** @var array<int, mixed> $contributed */
        $contributed = apply_filters('kizlo_introspection_schemas', []);

        foreach (self::list($contributed) as $entry) {
            if (is_array($entry) && Spec::isValidSchemaId($entry['id'] ?? null) && is_array($entry['schema'] ?? null)) {
                // Coerced here as well as in collectSchemas(), because this map is
                // what `$ref` resolves against when building route arguments — an
                // unrepaired flag in a referenced schema would reach WordPress.
                $schemas[$entry['id']] = SchemaCoercer::coerce($entry['schema']);
            }
        }

        return self::$schemaMap = $schemas;
    }

    /**
     * Cleared by {@see ManagedContent::flush()}, which is what makes a rebuild
     * mean something.
     */
    public static function flush(): void
    {
        self::$schemaMap = null;
    }

    /**
     * Build the document, excluding whatever cannot be published rather than
     * refusing to publish anything.
     *
     * One plugin's broken spec used to cost the site owner every type on the
     * install, including their own, over code they do not control. Now the broken
     * contribution is dropped, everything that depended on it is dropped with it,
     * and all of it is reported. Nothing disappears quietly, which was the real
     * point of refusing partial contracts in the first place.
     *
     * @return array<string, mixed>
     */
    public static function build(): array
    {
        $diagnostics = new Diagnostics();

        SpecStore::applyDiagnostics($diagnostics);

        $schemas    = self::cleanSchemas(self::collectSchemas($diagnostics), $diagnostics);
        $resolver   = new SchemaResolver($schemas);
        $operations = self::cleanOperations(self::collectOperations($diagnostics), $resolver, $diagnostics);

        return self::document($schemas, $operations, $diagnostics);
    }

    /**
     * Settle which schemas survive, then report against the settled set.
     *
     * Exclusion cascades: dropping `acme.money` leaves every schema that
     * referenced it with an unresolvable `$ref`, so the set has to be re-checked
     * until it stops shrinking. The passes that only discover the cascade report
     * into a scratch bag, so a schema excluded on the third pass is explained
     * once, in terms of the set that actually shipped.
     *
     * @param array<string, array<string, mixed>> $schemas
     * @return array<string, array<string, mixed>>
     */
    private static function cleanSchemas(array $schemas, Diagnostics $diagnostics): array
    {
        do {
            $scratch   = new Diagnostics();
            $validator = new SchemaValidator(new SchemaResolver($schemas), $scratch);
            $surviving = [];
            $failed    = [];

            foreach ($schemas as $id => $schema) {
                if ($validator->clean($schema, ['schema_id' => $id], '', ['stack' => [$id]]) !== null) {
                    $surviving[$id] = $schema;
                } else {
                    $failed[$id] = true;
                }
            }

            // Keep the reasons belonging to the schemas that died in this pass, and
            // only those. Their parents may be gone by the next pass, which would
            // turn a reported cycle into a reported missing parent.
            foreach ($scratch->all() as $entry) {
                if ($entry['type'] === Diagnostics::ERROR && isset($failed[Diagnostics::dataOf($entry)['schema_id'] ?? ''])) {
                    $diagnostics->adopt($entry);
                }
            }

            $settled = count($surviving) === count($schemas);
            $schemas = $surviving;
        } while (!$settled);

        $validator = new SchemaValidator(new SchemaResolver($schemas), $diagnostics);

        $cleaned = [];
        foreach ($schemas as $id => $schema) {
            $result = $validator->clean($schema, ['schema_id' => $id], '', ['stack' => [$id]]);

            if ($result !== null) {
                $cleaned[$id] = $result;
            }
        }

        return $cleaned;
    }

    /**
     * @param array<int, array<string, mixed>> $operations
     * @return array<int, array<string, mixed>>
     */
    private static function cleanOperations(array $operations, SchemaResolver $resolver, Diagnostics $diagnostics): array
    {
        $validator = new OperationValidator($resolver, $diagnostics);

        $cleaned = [];
        foreach ($operations as $operation) {
            $result = $validator->clean($operation);

            if ($result !== null) {
                $cleaned[] = $result;
            }
        }

        return $cleaned;
    }

    // ============================================================
    // SCHEMAS
    // ============================================================

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function collectSchemas(Diagnostics $errors): array
    {
        $schemas = [];

        foreach (CoreSchemas::all() as $id => $schema) {
            $schemas[$id] = $schema;
        }

        // Normalized on the way in, unlike schemaMap(), because a derived write
        // schema carries the sanitizers core registers its own routes with. Those
        // are PHP callables: the runtime map needs them so ArgTranslator can put
        // them back on the route, and the document must never see them.
        foreach (ManagedContent::schemas() as $id => $schema) {
            self::mergeSchema($schemas, $id, SchemaNormalizer::normalize($schema), $errors);
        }

        // Contributed schemas are coerced before they are compared, so two
        // registrations that differ only in a repairable typo still merge rather
        // than reporting a conflict.

        /** @var array<int, mixed> $contributed */
        $contributed = apply_filters('kizlo_introspection_schemas', []);

        foreach (self::list($contributed) as $entry) {
            if (!is_array($entry) || !isset($entry['id']) || !is_array($entry['schema'] ?? null)) {
                $errors->error(['keyword' => 'kizlo_introspection_schemas'], 'A contributed schema must be an ["id" => ..., "schema" => [...]] entry.');
                continue;
            }

            $id = $entry['id'];

            if (!Spec::isValidSchemaId($id)) {
                $errors->error(
                    ['keyword' => 'kizlo_introspection_schemas'],
                    sprintf('"%s" is not a valid schema ID; use a vendor-qualified name such as "acme.widget".', is_string($id) ? $id : gettype($id)),
                );
                continue;
            }

            if (Spec::isReservedId($id) && !SpecStore::isTrusted('schema', ['id' => $id, 'schema' => $entry['schema']])) {
                $errors->error(
                    ['schema_id' => $id, 'keyword' => 'id'],
                    sprintf('The "%s" prefix is reserved for Kizlo core.', self::reservedPrefix($id)),
                );
                continue;
            }

            self::mergeSchema($schemas, $id, SchemaCoercer::coerce($entry['schema']), $errors);
        }

        ksort($schemas, SORT_STRING);

        return $schemas;
    }

    /**
     * Identical registrations merge; anything else is a conflict, because the
     * generator cannot emit two different shapes under one name.
     *
     * @param array<string, array<string, mixed>> $schemas
     * @param array<string, mixed>                $schema
     */
    private static function mergeSchema(array &$schemas, string $id, array $schema, Diagnostics $errors): void
    {
        if (!array_key_exists($id, $schemas)) {
            $schemas[$id] = $schema;
            return;
        }

        if (Document::encode($schemas[$id]) === Document::encode($schema)) {
            return;
        }

        $errors->error(['schema_id' => $id], 'Registered twice with different definitions.');
    }

    // ============================================================
    // ROUTES
    // ============================================================

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function collectOperations(Diagnostics $errors): array
    {
        /** @var array<int, mixed> $contributed */
        $contributed = apply_filters('kizlo_introspection_routes', []);

        $grouped    = [];
        $namespaces = [];

        $declarations = [];
        foreach (self::list($contributed) as $declaration) {
            $declarations[] = ['declaration' => $declaration, 'core' => false];
        }
        foreach (ManagedContent::routes() as $declaration) {
            $declarations[] = ['declaration' => $declaration, 'core' => true];
        }

        foreach ($declarations as ['declaration' => $declaration, 'core' => $core]) {
            if (!is_array($declaration)) {
                $errors->error(['keyword' => 'kizlo_introspection_routes'], 'A contributed route must be an array.');
                continue;
            }

            $namespace = is_string($declaration['namespace'] ?? null) ? $declaration['namespace'] : '';
            $operation = OperationNormalizer::normalize($declaration, $namespace);
            $apiId     = (string) $operation['api_id'];

            if ($apiId === '') {
                $errors->error(['keyword' => 'kizlo_introspection_routes'], 'A contributed route must declare an "id".');
                continue;
            }

            if (Spec::isReservedId($apiId) && !$core && !SpecStore::isTrusted('route', $declaration)) {
                $errors->error(
                    ['api_id' => $apiId, 'keyword' => 'id'],
                    sprintf('The "%s" prefix is reserved for Kizlo core.', self::reservedPrefix($apiId)),
                );
                continue;
            }

            if (isset($namespaces[$apiId]) && $namespaces[$apiId] !== $namespace) {
                $errors->error(
                    ['api_id' => $apiId, 'keyword' => 'namespace'],
                    sprintf('Declared under both "%s" and "%s"; one API has one namespace.', $namespaces[$apiId], $namespace),
                );
                continue;
            }

            $namespaces[$apiId] = $namespace;

            self::mergeOperation($grouped, $operation, $errors);
        }

        $grouped = self::dropClashes($grouped, $errors);

        return array_values($grouped);
    }

    /**
     * Drop operations that cannot coexist.
     *
     * Three ways two operations collide, all of which leave a consumer with no
     * way to choose between them: the same method on one path, the same name
     * within one API, or two APIs claiming the same URL in one namespace. The
     * first one registered wins, and the loser is reported.
     *
     * @param array<string, array<string, mixed>> $grouped
     * @return array<string, array<string, mixed>>
     */
    private static function dropClashes(array $grouped, Diagnostics $errors): array
    {
        $methods = [];
        $names   = [];
        $routes  = [];

        $kept = [];

        foreach ($grouped as $key => $operation) {
            $location = [
                'api_id'    => (string) $operation['api_id'],
                'path'      => (string) $operation['path'],
                'operation' => (string) $operation['operation'],
            ];

            $nameKey = implode("\0", [$operation['api_id'], $operation['operation']]);

            if (isset($names[$nameKey])) {
                $errors->error(
                    $location + ['keyword' => 'operation'],
                    sprintf('Already used on "%s"; an operation name is a method name, so it is unique per API.', $names[$nameKey]),
                );
                continue;
            }

            $clash = false;

            foreach ($operation['methods'] as $method) {
                $methodKey = implode("\0", [$operation['api_id'], $operation['path'], $method]);
                $routeKey  = implode("\0", [$operation['namespace'], $operation['path'], $method]);

                if (isset($methods[$methodKey])) {
                    $errors->error(
                        $location + ['keyword' => 'methods'],
                        sprintf('"%s" is already handled by the "%s" operation on this path.', $method, $methods[$methodKey]),
                    );
                    $clash = true;
                    break;
                }

                if (isset($routes[$routeKey]) && $routes[$routeKey] !== $operation['api_id']) {
                    $errors->error(
                        $location + ['keyword' => 'route'],
                        sprintf('"%s %s" in "%s" is already described by the "%s" API.', $method, (string) $operation['path'], (string) $operation['namespace'], $routes[$routeKey]),
                    );
                    $clash = true;
                    break;
                }
            }

            if ($clash) {
                continue;
            }

            foreach ($operation['methods'] as $method) {
                $methods[implode("\0", [$operation['api_id'], $operation['path'], $method])]  = (string) $operation['operation'];
                $routes[implode("\0", [$operation['namespace'], $operation['path'], $method])] = (string) $operation['api_id'];
            }

            $names[$nameKey] = (string) $operation['path'];
            $kept[$key]      = $operation;
        }

        return $kept;
    }

    /**
     * @param array<string, array<string, mixed>> $grouped
     * @param array<string, mixed>                $operation
     */
    private static function mergeOperation(array &$grouped, array $operation, Diagnostics $errors): void
    {
        $key = implode("\0", [$operation['api_id'], $operation['path'], $operation['operation']]);

        if (!isset($grouped[$key])) {
            $grouped[$key] = $operation;
            return;
        }

        $existing = $grouped[$key];

        if (Document::encode(OperationNormalizer::mergeSignature($existing)) !== Document::encode(OperationNormalizer::mergeSignature($operation))) {
            $errors->error(
                [
                    'api_id'    => (string) $operation['api_id'],
                    'path'      => (string) $operation['path'],
                    'operation' => (string) $operation['operation'],
                ],
                'Declared twice with different input or responses; use separate operations.',
            );
            return;
        }

        $methods = array_values(array_unique(array_merge($existing['methods'], $operation['methods'])));
        sort($methods);

        $grouped[$key]['methods'] = $methods;
    }

    // ============================================================
    // DOCUMENT
    // ============================================================

    /**
     * @param array<string, array<string, mixed>> $schemas
     * @param array<int, array<string, mixed>>    $operations
     * @return array<string, mixed>
     */
    private static function document(array $schemas, array $operations, Diagnostics $diagnostics): array
    {
        $apis = [];

        foreach ($operations as $operation) {
            $apiId = (string) $operation['api_id'];
            $path  = (string) $operation['path'];

            $apis[$apiId] ??= ['namespace' => (string) $operation['namespace'], 'paths' => []];
            $apis[$apiId]['paths'][$path] ??= [];
            $apis[$apiId]['paths'][$path][(string) $operation['operation']] = OperationNormalizer::toDocument($operation);
        }

        ksort($apis, SORT_STRING);

        foreach ($apis as $apiId => $api) {
            ksort($api['paths'], SORT_STRING);

            foreach ($api['paths'] as $path => $pathOperations) {
                ksort($pathOperations, SORT_STRING);
                $api['paths'][$path] = $pathOperations;
            }

            $apis[$apiId] = $api;
        }

        return Document::finalize([
            'schemas'     => $schemas,
            'apis'        => $apis,
            'diagnostics' => $diagnostics->sorted(),
        ]);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * @return array<int, mixed>
     */
    private static function list(mixed $value): array
    {
        return is_array($value) ? array_values($value) : [];
    }

    private static function reservedPrefix(string $id): string
    {
        foreach (Spec::RESERVED_ID_PREFIXES as $prefix) {
            if (str_starts_with($id, $prefix)) {
                return $prefix;
            }
        }

        return '';
    }
}
