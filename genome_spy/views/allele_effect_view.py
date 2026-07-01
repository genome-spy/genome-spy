from flask import render_template
from genome_spy.charts.line_chart import LineChart

class AlleleEffectView:
    def __init__(self):
        self.line_chart = LineChart()

    def display_allele_effect(self):
        data = {'x': [1, 2, 3], 'y': [4, 5, 6], 'hovertext': ['a', 'b', 'c']}
        allele_effect = AlleleEffect(data)
        fig = self.line_chart.generate_chart()
        return render_template('allele_effect.html', fig=fig)