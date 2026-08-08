<?php

namespace Kizlo\Modules\Registration;

use InvalidArgumentException;
use Kizlo\Modules\Settings\SettingsCache;
use Kizlo\Modules\Webhook\Webhook;

/**
 * Domain operations for Kizlo-owned definitions (custom post types and
 * taxonomies): create, update, activate, and the resumable delete flow. Post
 * types and taxonomies share the logic via the `kind` argument.
 *
 * This is the routeless engine behind the unified `/settings/{kind}` REST
 * surface — the settings services own the routes and call these methods. All
 * routes are already locked to `manage_options` by the global REST guard.
 */
class DefinitionController
{
    private const KIND_POST_TYPES = 'post_types';

    private const SETTINGS_OPTIONS = [
        'post_types' => 'kizlo_settings_post_types',
        'taxonomies' => 'kizlo_settings_taxonomies',
    ];

    /**
     * Create a new Kizlo-owned definition from a create payload (definition
     * fields plus a `key`).
     *
     * @param array<string, mixed> $body
     * @return array{slug: string, kind: string, restored: bool}
     */
    public function create(string $kind, array $body): array
    {
        $key = sanitize_key((string) ($body['key'] ?? ''));

        $this->assertLabels($body);

        if ($kind === self::KIND_POST_TYPES) {
            RegistrationValidator::assertPostTypeKey($key);
            $definition = new PostTypeRegistration();
        } else {
            RegistrationValidator::assertTaxonomyKey($key);
            $definition = new TaxonomyRegistration();
        }

        $body['key'] = $key;
        $definition->setData($body);
        $definition->save($key);

        RewriteFlusher::markDirty();
        SettingsCache::invalidate();

        Webhook::sendEvent(Webhook::REGISTRATION_CREATED_EVENT, ['kind' => $kind, 'key' => $key]);

        return [
            'slug'     => $key,
            'kind'     => $kind,
            'restored' => $this->hasRetainedSettings($kind, $key),
        ];
    }

    /**
     * Apply the definition portion of a settings payload to an existing
     * Kizlo-owned definition. Keys the definition does not declare are ignored,
     * so the same combined body can also be fed to the per-slug settings object.
     *
     * @param array<string, mixed> $body
     */
    public function updateDefinition(string $kind, string $slug, array $body): void
    {
        $definition = $this->find($kind, $slug);

        // Keys are immutable after creation.
        unset($body['key']);

        $definition->setData($body);
        $definition->save($slug);

        RewriteFlusher::markDirty();
        SettingsCache::invalidate();

        Webhook::sendEvent(Webhook::REGISTRATION_UPDATED_EVENT, ['kind' => $kind, 'key' => $slug]);
    }

    /**
     * @return array{slug: string, kind: string, active: bool}
     */
    public function setActive(string $kind, string $slug, bool $active): array
    {
        $definition = $this->find($kind, $slug);

        $definition->setData(['active' => $active]);
        $definition->save($slug);

        RewriteFlusher::markDirty();
        SettingsCache::invalidate();

        Webhook::sendEvent(Webhook::REGISTRATION_UPDATED_EVENT, ['kind' => $kind, 'key' => $slug]);

        return ['slug' => $slug, 'kind' => $kind, 'active' => $active];
    }

    /**
     * Begin deleting a definition. In `keep_items` mode the definition is
     * unregistered immediately; in `delete_items` mode its items are drained in
     * resumable batches before the definition and its settings are removed.
     *
     * @return array<string, mixed>
     */
    public function delete(string $kind, string $slug, string $mode): array
    {
        $this->find($kind, $slug);

        $mode = $mode === 'delete_items' ? 'delete_items' : 'keep_items';

        if ($mode === 'keep_items') {
            $this->definitionClass($kind)::delete($slug);
            RewriteFlusher::markDirty();

            Webhook::sendEvent(Webhook::REGISTRATION_DELETED_EVENT, ['kind' => $kind, 'key' => $slug, 'mode' => $mode]);

            return ['slug' => $slug, 'kind' => $kind, 'mode' => $mode, 'complete' => true];
        }

        $progress = ItemDeleter::start($slug, $this->itemKind($kind));

        if ($progress['complete']) {
            $this->finalizeDelete($kind, $slug);
        }

        return ['mode' => $mode] + $progress;
    }

    /**
     * @return array<string, mixed>
     */
    public function processDelete(string $kind, string $slug): array
    {
        $progress = ItemDeleter::processBatch($slug);

        if ($progress['complete']) {
            $this->finalizeDelete($kind, $slug);
            ItemDeleter::clear($slug);
        }

        return $progress;
    }

    /**
     * @return array<string, mixed>
     */
    public function retryDelete(string $kind, string $slug): array
    {
        $progress = ItemDeleter::retry($slug);

        if ($progress['complete']) {
            $this->finalizeDelete($kind, $slug);
            ItemDeleter::clear($slug);
        }

        return $progress;
    }

    /**
     * Remove the object's Kizlo settings/field definitions, then the definition
     * itself, after its items have been deleted.
     */
    private function finalizeDelete(string $kind, string $slug): void
    {
        $option = self::SETTINGS_OPTIONS[$kind];
        $all    = get_option($option, []);

        if (is_array($all) && array_key_exists($slug, $all)) {
            unset($all[$slug]);
            update_option($option, $all);
        }

        $this->definitionClass($kind)::delete($slug);
        RewriteFlusher::markDirty();

        Webhook::sendEvent(Webhook::REGISTRATION_DELETED_EVENT, ['kind' => $kind, 'key' => $slug, 'mode' => 'delete_items']);
    }

    /**
     * Load an existing Kizlo-owned definition.
     *
     * @throws InvalidArgumentException When no such definition exists.
     */
    private function find(string $kind, string $slug): RegistrationAbstract
    {
        $class = $this->definitionClass($kind);

        if (!$class::exists($slug)) {
            throw new InvalidArgumentException("No Kizlo-owned {$kind} definition for \"{$slug}\".");
        }

        return $class::load($slug);
    }

    /**
     * @return class-string<RegistrationAbstract>
     */
    private function definitionClass(string $kind): string
    {
        return $kind === self::KIND_POST_TYPES ? PostTypeRegistration::class : TaxonomyRegistration::class;
    }

    private function itemKind(string $kind): string
    {
        return $kind === self::KIND_POST_TYPES ? ItemDeleter::KIND_POST_TYPE : ItemDeleter::KIND_TAXONOMY;
    }

    private function hasRetainedSettings(string $kind, string $slug): bool
    {
        $all = get_option(self::SETTINGS_OPTIONS[$kind], []);

        return is_array($all) && !empty($all[$slug]);
    }

    /**
     * @param array<string, mixed> $body
     * @throws InvalidArgumentException When required labels are missing.
     */
    private function assertLabels(array $body): void
    {
        if (empty($body['singular_label']) || empty($body['plural_label'])) {
            throw new InvalidArgumentException('A singular and plural label are required.');
        }
    }
}
