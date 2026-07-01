from flask import render_template
from genome_spy.charts.line_chart import LineChart

class QTLMappingView:
    def __init__(self):
        self.line_chart = LineChart()

    def display_qtl_mapping(self):
        data = {'x': [1, 2, 3], 'y': [4, 5, 6], 'hovertext': ['a', 'b', 'c']}
        qtl_mapping = QTLMapping(data)
        fig = self.line_chart.generate_chart()
        return render_template('qtl_mapping.html', fig=fig)