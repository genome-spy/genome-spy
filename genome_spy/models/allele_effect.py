class AlleleEffect:
    def __init__(self, data):
        self.data = data

    def prepare_data(self):
        x = self.data['x']
        y = self.data['y']
        return {'x': x, 'y': y}