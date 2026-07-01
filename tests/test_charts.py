import unittest
from genome_spy.charts.line_chart import LineChart
from genome_spy.models.qtl_mapping import QTLMapping
from genome_spy.models.allele_effect import AlleleEffect

class TestLineChart(unittest.TestCase):
    def test_line_chart(self):
        data = {'x': [1, 2, 3], 'y': [4, 5, 6], 'hovertext': ['a', 'b', 'c']}
        qtl_mapping = QTLMapping(data)
        allele_effect = AlleleEffect(data)
        line_chart = LineChart(qtl_mapping.prepare_data())
        fig = line_chart.generate_chart()
        self.assertIsNotNone(fig)

if __name__ == '__main__':
    unittest.main()