import hashlib
import unittest
import render

class ContractTests(unittest.TestCase):
    def test_model_exact_size_and_hash(self):
        previous = render.MODELS
        try:
            render.MODELS = {"test": (3, hashlib.sha256(b"abc").hexdigest())}
            self.assertTrue(render.valid_model("test", b"abc"))
            self.assertFalse(render.valid_model("test", b"abcd"))
            self.assertFalse(render.valid_model("test", b"abd"))
        finally:
            render.MODELS = previous
    def test_fixed_turkish_sample_only(self):
        self.assertIn("Bu bir erkek ses denemesidir", render.TEXT)
        self.assertLess(len(render.TEXT), 180)
        self.assertEqual(sum(x[0] for x in render.MODELS.values()), 398075273)
    def test_local_execution_refused(self):
        import os
        from unittest.mock import patch
        with patch.dict(os.environ, {"GITHUB_ACTIONS": "false"}):
            with self.assertRaisesRegex(RuntimeError, "cloud CI"):
                render.main()

if __name__ == "__main__":
    unittest.main()
