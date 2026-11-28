import json
import os
import pathlib
import re
import stat
import subprocess
import tempfile
import textwrap
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github/workflows/jnibarger01-pr-review-merge.yml'

# Fake `gh`: serves the fixture for the requested endpoint, then applies the
# caller's --jq expression exactly as the real CLI would.
FAKE_GH = textwrap.dedent('''\
    #!/usr/bin/env python3
    import json, os, subprocess, sys
    args = sys.argv[1:]
    endpoint = next(a for a in args if not a.startswith('-') and a != 'api')
    fixture = json.loads(os.environ['FAKE_GH_FIXTURE'])
    if 'actions/runs/' in endpoint:
        payload = {'jobs': fixture['jobs']}
        if fixture.get('jobs_error'):
            sys.stderr.write('HTTP 500\\n'); sys.exit(1)
    else:
        payload = fixture['check_run']
    data = json.dumps(payload)
    if '--jq' in args:
        expr = args[args.index('--jq') + 1]
        out = subprocess.run(['jq', '-r', expr], input=data, text=True, capture_output=True)
        sys.stdout.write(out.stdout); sys.stderr.write(out.stderr); sys.exit(out.returncode)
    sys.stdout.write(data)
''')


def extract_lookup_block():
    """The exact shell that resolves this job's check-run node ID in the workflow."""
    text = WORKFLOW.read_text()
    match = re.search(r'(own_checks="\$\(gh api.*?)\n\s*ready=false', text, re.S)
    if not match:
        raise AssertionError('lookup block not found in workflow')
    return match.group(1)


class OwnCheckLookupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.block = extract_lookup_block()
        cls.tmp = tempfile.TemporaryDirectory()
        gh = pathlib.Path(cls.tmp.name) / 'gh'
        gh.write_text(FAKE_GH)
        gh.chmod(gh.stat().st_mode | stat.S_IEXEC)
        cls.bin_dir = cls.tmp.name

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_lookup(self, jobs, check_run=None, jobs_error=False):
        script = self.block + '\necho "OWN_CHECK_ID=$own_check_id"\n'
        env = {
            'PATH': f'{self.bin_dir}:{os.environ["PATH"]}',
            'GITHUB_REPOSITORY': 'jnibarger01/prompt-library',
            'GITHUB_RUN_ID': '1',
            'GITHUB_RUN_ATTEMPT': '1',
            'FAKE_GH_FIXTURE': json.dumps({
                'jobs': jobs,
                'jobs_error': jobs_error,
                'check_run': check_run or {'node_id': 'CR_kwDOself'},
            }),
        }
        return subprocess.run(['bash', '-c', 'set -euo pipefail\n' + script],
                              env=env, text=True, capture_output=True)

    def job(self, job_id, name='PR review and merge gate', status='in_progress'):
        return {'id': job_id, 'name': name, 'status': status}

    def test_unique_running_job_resolves_node_id(self):
        r = self.run_lookup([self.job(555), self.job(556, name='other', status='completed')])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('OWN_CHECK_ID=CR_kwDOself', r.stdout)

    def test_zero_matching_jobs_refuses(self):
        r = self.run_lookup([self.job(555, status='completed')])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('refusing to merge', r.stderr)
        self.assertNotIn('OWN_CHECK_ID=CR_', r.stdout)

    def test_two_matching_jobs_refuses(self):
        r = self.run_lookup([self.job(555), self.job(777)])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('refusing to merge', r.stderr)

    def test_non_numeric_job_id_refuses(self):
        r = self.run_lookup([self.job('abc')])
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('refusing to merge', r.stderr)

    def test_null_node_id_refuses(self):
        r = self.run_lookup([self.job(555)], check_run={'node_id': None})
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('refusing to merge', r.stderr)

    def test_api_failure_refuses(self):
        r = self.run_lookup([], jobs_error=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertNotIn('OWN_CHECK_ID=CR_', r.stdout)


if __name__ == '__main__':
    unittest.main()
