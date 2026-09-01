from people_quality.people_learning_rank import people_learning_relevance_score


def test_minecraft_is_excluded():
    assert people_learning_relevance_score(
        "Begin Python coding in Minecraft with MakeCode", "module", "beginner"
    ) < 0


def test_k12_is_excluded():
    assert people_learning_relevance_score("Python for K-12 students", "module", "beginner") < 0


def test_enterprise_python_outranks_beginner_tutorial():
    enterprise = people_learning_relevance_score(
        "Explore and analyze data with Python", "learning_path", "intermediate"
    )
    beginner = people_learning_relevance_score(
        "Get started with Python programming", "module", "beginner"
    )
    assert enterprise > 0
    assert beginner > 0
    assert enterprise > beginner


def test_certification_preferred():
    cert = people_learning_relevance_score(
        "Microsoft Azure AI Engineer certification", "certification", "advanced"
    )
    module = people_learning_relevance_score("Python basics", "module", "beginner")
    assert cert > module
