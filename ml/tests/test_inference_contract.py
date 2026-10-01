import unittest

from service.app import ScreenRequest, evaluate


class InferenceContractTests(unittest.TestCase):
    def test_unknown_or_missing_models_are_manual_only(self):
        for content_type, features in [
            ('SALARY', {'roleId': 999}), ('REVIEW', {'reviewTitle': 'A review'}),
            ('INTERVIEW', {'processDescription': 'An interview'}),
            ('JOB', {'title': 'A job'}), ('PROFILE', {'headline': 'Engineer'}),
            ('COMPANY', {'description': 'A company'})
        ]:
            result = evaluate(ScreenRequest(contentType=content_type, featureSchemaVersion='1', features=features), {}, {})
            self.assertEqual(result['decision'], 'MANUAL_REVIEW')
            self.assertNotEqual(result['decision'], 'AUTO_REJECT')

    def test_schema_mismatch_and_unknown_role_are_out_of_distribution(self):
        mismatch = evaluate(ScreenRequest(contentType='SALARY', featureSchemaVersion='wrong', features={'roleId': 1}), {}, {})
        self.assertEqual(mismatch['reasonCodes'], ['SCHEMA_MISMATCH'])
        unknown = evaluate(ScreenRequest(contentType='SALARY', featureSchemaVersion='1', features={'roleId': '1'}), {}, {})
        self.assertEqual(unknown['reasonCodes'], ['UNKNOWN_CATEGORY'])

    def test_payload_is_strictly_bounded(self):
        with self.assertRaises(ValueError):
            ScreenRequest(contentType='REVIEW', featureSchemaVersion='1', features={str(i): i for i in range(25)})


if __name__ == '__main__':
    unittest.main()
