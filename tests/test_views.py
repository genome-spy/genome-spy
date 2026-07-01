import unittest
from genome_spy.views.qtl_mapping_view import QTLMappingView
from genome_spy.views.allele_effect_view import AlleleEffectView

class TestQTLMappingView(unittest.TestCase):
    def test_display_qtl_mapping(self):
        view = QTLMappingView()
        response = view.display_qtl_mapping()
        self.assertIsNotNone(response)

class TestAlleleEffectView(unittest.TestCase):
    def test_display_allele_effect(self):
        view = AlleleEffectView()
        response = view.display_allele_effect()
        self.assertIsNotNone(response)

if __name__ == '__main__':
    unittest.main()