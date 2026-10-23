"""Unit & integration tests for Parando FastAPI backend layer."""
import unittest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from src.api.main import app, store, guard
from src.core.competition_kernel import CommitmentProof, Competition, CompetitionRules, CompetitionStatus


class TestFastAPIEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_check(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("TR-12", data["kernel_conformance"])

    def test_list_competitions(self):
        response = self.client.get("/api/v1/competitions")
        self.assertEqual(response.status_code, 200)
        competitions = response.json()
        self.assertGreater(len(competitions), 0)
        self.assertEqual(competitions[0]["competition_id"], "COMP-GOLD-001")

    def test_get_competition_by_id(self):
        response = self.client.get("/api/v1/competitions/COMP-GOLD-001")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["competition_id"], "COMP-GOLD-001")
        self.assertEqual(data["tenant_id"], "tenant-gold-bourse")

    def test_submit_valid_offer_and_tr12_replay(self):
        """TR-12: Identical payload returns prior result; differing payload raises 409 Conflict."""
        idem_key = "test-idem-replay-001"
        payload = {
            "offerer_id": "offerer-alpha",
            "tenant_id": "tenant-gold-bourse",
            "amount": 42_500_000_000,
            "idempotency_key": idem_key,
        }

        # 1. First submission
        res1 = self.client.post("/api/v1/competitions/COMP-GOLD-001/offers", json=payload)
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()
        self.assertTrue(data1["success"])
        self.assertEqual(data1["rank"], 1)
        self.assertFalse(data1["is_duplicate_replay"])

        # 2. Identical replay
        res2 = self.client.post("/api/v1/competitions/COMP-GOLD-001/offers", json=payload)
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertTrue(data2["is_duplicate_replay"])
        self.assertEqual(res2.headers.get("x-idempotency-replay"), "true")
        self.assertEqual(data2["rank"], data1["rank"])

        # 3. Differing payload on same idempotency key -> 409 Conflict
        conflicting_payload = {
            "offerer_id": "offerer-alpha",
            "tenant_id": "tenant-gold-bourse",
            "amount": 45_000_000_000,
            "idempotency_key": idem_key,
        }
        res3 = self.client.post("/api/v1/competitions/COMP-GOLD-001/offers", json=conflicting_payload)
        self.assertEqual(res3.status_code, 409)
        self.assertIn("OFFER_CONFLICT", res3.json()["detail"])

    def test_submit_offer_below_minimum(self):
        payload = {
            "offerer_id": "offerer-beta",
            "tenant_id": "tenant-gold-bourse",
            "amount": 100,  # Below base price
            "idempotency_key": "test-below-min-001",
        }
        res = self.client.post("/api/v1/competitions/COMP-GOLD-001/offers", json=payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn("OFFER_BELOW_MINIMUM", res.json()["detail"])

    def test_seller_cannot_offer(self):
        payload = {
            "offerer_id": "central-bullion-vault",  # Seller ID
            "tenant_id": "tenant-gold-bourse",
            "amount": 50_000_000_000,
            "idempotency_key": "test-seller-001",
        }
        res = self.client.post("/api/v1/competitions/COMP-GOLD-001/offers", json=payload)
        self.assertEqual(res.status_code, 403)
        self.assertIn("SELLER_CANNOT_OFFER", res.json()["detail"])

    def test_commitment_proof_registration(self):
        proof_req = {
            "offerer_id": "offerer-gamma",
            "tenant_id": "tenant-gold-bourse",
            "guaranteed_amount": 300_000_000_000,
            "valid_hours": 48,
        }
        res = self.client.post("/api/v1/proofs", json=proof_req)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["offerer_id"], "offerer-gamma")
        self.assertTrue(data["is_active"])


if __name__ == "__main__":
    unittest.main()
