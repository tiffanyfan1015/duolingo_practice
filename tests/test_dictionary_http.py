import json
import tempfile
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen
from vocab_sync.dictionary_http import dictionary_handler
from vocab_sync.pilot.dictionary_api import DictionaryAPI


class DictionaryHTTPTests(unittest.TestCase):
    def test_local_endpoint_validates_provider_and_serves_only_web_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'web').mkdir()
            (root / 'private.txt').write_text('must not be served')
            (root / 'web/index.html').write_text('study page')
            handler = dictionary_handler(root)
            handler.log_message = lambda *args: None
            server = ThreadingHTTPServer(('127.0.0.1',0),partial(handler,directory=str(root/'web')))
            thread = threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            base = f'http://127.0.0.1:{server.server_port}'
            try:
                with patch.object(DictionaryAPI,'get',return_value={'error':{'code':'missingtitle'}}) as get:
                    with urlopen(base+'/api/dictionary?provider=wiki&term=test') as response:
                        self.assertEqual(response.headers['Cache-Control'],'private, no-store')
                        self.assertEqual(json.load(response)['error']['code'],'missingtitle')
                    self.assertEqual(get.call_args.args[0],'https://zh.wiktionary.org/w/api.php')
                    self.assertEqual(get.call_args.args[1]['page'],'test')
                    with self.assertRaises(HTTPError) as caught:
                        urlopen(base+'/api/dictionary?provider=https://evil.test&term=test')
                    self.assertEqual(caught.exception.code,400)
                    self.assertEqual(get.call_count,1)
                with urlopen(base) as response:
                    self.assertEqual(response.read(),b'study page')
                with self.assertRaises(HTTPError) as caught:
                    urlopen(base+'/private.txt')
                self.assertEqual(caught.exception.code,404)
            finally:
                server.shutdown()
                server.server_close()

    def test_rate_limit_stops_followup_calls_without_caching_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            api = DictionaryAPI(tmp)
            error = HTTPError('https://zh.wiktionary.org/w/api.php',429,'Too Many Requests',{'Retry-After':'60'},None)
            with patch('vocab_sync.pilot.dictionary_api.urlopen',side_effect=error) as fetch:
                with self.assertRaises(HTTPError):
                    api.wiki('first','de')
                with self.assertRaisesRegex(ValueError,'限流'):
                    api.wiki('second','de')
                self.assertEqual(fetch.call_count,1)
                self.assertEqual(list(Path(tmp).iterdir()),[])


if __name__ == '__main__':
    unittest.main()
