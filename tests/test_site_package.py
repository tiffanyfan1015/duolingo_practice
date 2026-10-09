from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile
from scripts.package_site import package_site, ROOT_ASSETS, VENDOR_ASSETS


class SitePackageTests(unittest.TestCase):
    def test_only_website_assets_are_packed_at_archive_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            web = root / 'web'
            for name in [*ROOT_ASSETS, *('vendor/' + x for x in VENDOR_ASSETS), 'src/domain/test.mjs', 'styles/test.css', '.env', 'backup.json']:
                path = web / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('test', encoding='utf-8')
            (root / 'private-export.json').write_text('private', encoding='utf-8')
            archive = root / 'site.zip'
            count = package_site(web, archive)
            with ZipFile(archive) as result:
                names = result.namelist()
                self.assertIn('index.html', names)
                self.assertIn('src/domain/test.mjs', names)
                self.assertIn('data.json', names)
                self.assertNotIn('.env', names)
                self.assertNotIn('backup.json', names)
                self.assertNotIn('private-export.json', names)
                self.assertEqual(count, len(names))

    def test_missing_catalog_does_not_create_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                package_site(root, root / 'site.zip')
            self.assertFalse((root / 'site.zip').exists())
