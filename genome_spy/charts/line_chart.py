class LineChart:
    def __init__(self, data):
        self.data = data

    def generate_chart(self):
        fig = go.Figure(data=[go.Scatter(x=self.data['x'], y=self.data['y'],
                                          hoverinfo='x+y',
                                          hovertext=self.data['hovertext'])])
        fig.update_layout(title='Line Chart',
                          xaxis_title='X Axis',
                          yaxis_title='Y Axis',
                          dragmode='pan',
                          clickmode='event+select')
        return fig