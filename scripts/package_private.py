"""Build the protected deployment ZIP, including the existing local word list."""
from zipfile import ZipFile, ZIP_DEFLATED
from cloud_build import build, ROOT

if __name__ == '__main__':
    output = build(include_personal=True)
    target = ROOT / 'artifacts' / 'cijian-private.zip'
    target.parent.mkdir(exist_ok=True)
    with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
        for path in output.rglob('*'):
            if path.is_file(): archive.write(path, path.relative_to(output).as_posix())
    print(target)
