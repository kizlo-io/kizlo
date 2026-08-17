<?php

namespace Kizlo\Modules\Extension;

/**
 * The gate every Kizlo extension plugin starts through, and the record of which ones did.
 *
 * An extension plugin is a plugin that calls Kizlo's PHP API. Those functions
 * arrive in core releases, so an extension built against a newer core reaches an
 * undefined function the moment it runs against an older one, and WordPress
 * answers that with a fatal rather than a notice. `Requires Plugins` does not
 * help: it checks that a slug is active, not that it is new enough.
 *
 * So the extension declares its versions in a header and hands its boot to
 * {@see self::register()}, which runs it only when every requirement holds. A
 * blocked extension registers nothing, which is the point: nothing of it runs,
 * so nothing of it can fatal, and the reason is on the Plugins screen instead.
 *
 * The comparison lives here once. An extension that wrote its own would be
 * writing the part that has to agree with every other extension, and would
 * still be left with the case this cannot cover, where core is too old to
 * contain this class at all. That one belongs to the extension, and is two
 * lines: see `kizlo_extension()`.
 */
final class Extensions
{
    /**
     * @var array<string, string> Slug to version, for extensions that started.
     */
    private static array $booted = [];

    /**
     * @var array<int, array{name: string, slug: string, unmet: array<int, Requirement>}>
     */
    private static array $blocked = [];

    public static function register(string $file, callable $boot): bool
    {
        $slug  = self::slug($file);
        $data  = get_file_data($file, ['name' => 'Plugin Name', 'version' => 'Version']);
        $unmet = Requirements::unmet(Requirements::read($file));

        if ($unmet !== []) {
            self::$blocked[] = [
                'slug'  => $slug,
                'name'  => $data['name'] !== '' ? $data['name'] : $slug,
                'unmet' => $unmet,
            ];

            return false;
        }

        self::$booted[$slug] = $data['version'];

        $boot();

        return true;
    }

    /**
     * @return array<string, string>
     */
    public static function booted(): array
    {
        return self::$booted;
    }

    /**
     * @return array<int, array{name: string, slug: string, unmet: array<int, Requirement>}>
     */
    public static function blocked(): array
    {
        return self::$blocked;
    }

    /**
     * Forget every registration. Test seam: WordPress resets its hooks between
     * tests but a static registry outlives them.
     */
    public static function reset(): void
    {
        self::$booted  = [];
        self::$blocked = [];
    }

    /**
     * The directory a plugin lives in, which is the slug its requirements name it by.
     * `dirname()` answers `.` for a single-file plugin, which has its file name instead.
     */
    private static function slug(string $file): string
    {
        $directory = dirname(plugin_basename($file));

        return $directory !== '.' ? $directory : basename($file, '.php');
    }
}
