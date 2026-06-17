from alphagenome.src.schema import ScoreResponse


def test_score_response_accepts_contact_map_matrix_values() -> None:
    response = ScoreResponse.model_validate(
        {
            "scores": [
                {
                    "atac": [0.1, -0.2, 0.3],
                    "contact_maps": [
                        [0.01, -0.02],
                        [0.03, -0.04],
                    ],
                }
            ]
        }
    )

    assert response.scores[0]["atac"] == [0.1, -0.2, 0.3]
    assert response.scores[0]["contact_maps"] == [
        [0.01, -0.02],
        [0.03, -0.04],
    ]
