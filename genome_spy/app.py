from flask import Flask
from genome_spy.routes import qtl_mapping_blueprint, allele_effect_blueprint

app = Flask(__name__)
app.register_blueprint(qtl_mapping_blueprint)
app.register_blueprint(allele_effect_blueprint)