import json
import pathlib
import re
import subprocess
import unittest

WORKFLOW = pathlib.Path('.github/workflows/jnibarger01-pr-review-merge.yml')

class MergeGateChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        workflow = WORKFLOW.read_text()
        cls.expressions = {}
        for name in ('pending_checks', 'failed_checks'):
            pattern = name + r'''="\$\(jq --arg own_check_id "\$own_check_id" '(.*?)' <<<"\$snapshot"\)"'''
            cls.expressions[name] = re.search(pattern, workflow, re.S).group(1)
        assert '                                    id\n' in workflow
        assert 'app { slug }' not in workflow

    def classify(self, nodes):
        snapshot = {'data': {'repository': {'pullRequest': {'commits': {'nodes': [{'commit': {'statusCheckRollup': {'contexts': {'nodes': nodes}}}}]}}}}}
        return tuple(int(subprocess.run(['jq', '--arg', 'own_check_id', 'self', expr], input=json.dumps(snapshot), text=True, capture_output=True, check=True).stdout) for expr in self.expressions.values())

    def test_ignores_only_own_running_check(self):
        self.assertEqual((0, 0), self.classify([{'__typename': 'CheckRun', 'id': 'self', 'name': 'PR review and merge gate', 'status': 'IN_PROGRESS'}]))

    def test_same_name_failed_check_blocks(self):
        self.assertEqual((0, 1), self.classify([{'__typename': 'CheckRun', 'id': 'other', 'name': 'PR review and merge gate', 'status': 'COMPLETED', 'conclusion': 'FAILURE'}]))

    def test_pending_check_blocks(self):
        self.assertEqual((1, 0), self.classify([{'__typename': 'CheckRun', 'id': 'other', 'status': 'IN_PROGRESS'}]))

    def test_success_and_neutral_are_accepted(self):
        self.assertEqual((0, 0), self.classify([{'__typename': 'CheckRun', 'id': 'other', 'status': 'COMPLETED', 'conclusion': 'SUCCESS'}, {'__typename': 'CheckRun', 'id': 'third', 'status': 'COMPLETED', 'conclusion': 'NEUTRAL'}]))

    def test_legacy_failed_status_blocks(self):
        self.assertEqual((0, 1), self.classify([{'__typename': 'StatusContext', 'state': 'FAILURE'}]))

    def test_null_check_identity_is_not_exempt(self):
        self.assertEqual((0, 1), self.classify([{'__typename': 'CheckRun', 'id': None, 'status': 'COMPLETED', 'conclusion': 'FAILURE'}]))

if __name__ == '__main__':
    unittest.main()
