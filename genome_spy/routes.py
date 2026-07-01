from flask import Blueprint
from genome_spy.views.qtl_mapping_view import QTLMappingView
from genome_spy.views.allele_effect_view import AlleleEffectView

qtl_mapping_blueprint = Blueprint('qtl_mapping', __name__)
allele_effect_blueprint = Blueprint('allele_effect', __name__)

qtl_mapping_blueprint.add_url_rule('/qtl_mapping', view_func=QTLMappingView().display_qtl_mapping)
allele_effect_blueprint.add_url_rule('/allele_effect', view_func=AlleleEffectView().display_allele_effect)