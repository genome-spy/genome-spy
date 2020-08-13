#!/usr/bin/env python3

# Creates a compressed version of RefSeq genes:
# 1) Exons of all overlapping isoforms are merged
# 2) Exons are run-length encoded
#
# Original RefSeqGene format:
# https://genome.ucsc.edu/FAQ/FAQformat.html#format1
#
# GenomeSpy uses scores to prioritize gene symbols shown on the gene track.
# A method described on HiGlass' website assigns each gene a score based
# on its citation count. The produced geneAnnotations.bed file can be
# compressed using this script.
#
# https://docs.higlass.io/data_preparation.html#gene-annotation-tracks
#
# Usage:
# python3 compressGeneAnnotations.py geneAnnotations.bed > geneAnnotations.txt
#
# Copyright (c) Kari Lavikka
# 

import csv
import sys

def compute_union(exonStarts, exonEnds):
    edges = [(x, 1) for x in exonStarts] + [(x, -1) for x in exonEnds]
    edges.sort(key=lambda t: t[0])

    intervals = []
    height = 0
    start = 0

    for t in edges:
        if height == 0:
            start = t[0]
        
        height += t[1]
        if height == 0:
            intervals.append((start, t[0]))
    
    return intervals


def run_length_encode(reference, intervals):
    '''
    Returns alternating exon and gap lengths.
    '''
    deltas = []

    for t in intervals:
        delta = t[0] - reference
        deltas.append(delta)
        reference = reference + delta

        delta = t[1] - reference
        deltas.append(delta)
        reference = reference + delta
    
    return deltas 


def split_exons(exonString):
    return [int(x) for x in exonString.split(",") if x != '']


def main():
    genes = {}

    def find_gene(symbol, txStart, txEnd):
        '''
        A handful of genes have isoforms that have disjoint intervals!
        '''
        if symbol in genes:
            for gene in genes[symbol]:
                if gene['txEnd'] >= txStart and gene['txStart'] <= txEnd:
                    return gene
        
        return None


    def add_gene(symbol, gene):
        if symbol in genes:
            genes[symbol].append(gene)
        else:
            genes[symbol] = [gene]


    with open(sys.argv[1], 'r') as input_file:
        output_file = sys.stdout
        reader = csv.DictReader(input_file, dialect='excel-tab',
                    fieldnames=['chr', 'txStart', 'txEnd', 'geneName', 'citationCount', 'strand', 'refseqId',
                        'geneId', 'geneType', 'geneDesc', 'cdsStart', 'cdsEnd',
                        'exonStarts', 'exonEnds'])

        for row in reader:
            symbol = row['geneName']
            txStart = int(row['txStart'])
            txEnd = int(row['txEnd'])

            gene = find_gene(symbol, txStart, txEnd)

            if gene is not None:
                gene['txStart'] = min(gene['txStart'], txStart)
                gene['txEnd'] = max(gene['txEnd'], txEnd)
                gene['exonStarts'].extend(split_exons(row['exonStarts']))
                gene['exonEnds'].extend(split_exons(row['exonEnds']))

            else:
                gene = {
                    'symbol': symbol,
                    'chr': row['chr'],
                    'txStart': txStart,
                    'txEnd': txEnd,
                    'strand': row['strand'],
                    'score': int(row['citationCount']),
                    'exonStarts': split_exons(row['exonStarts']),
                    'exonEnds': split_exons(row['exonEnds']),
                }
                add_gene(symbol, gene)


        writer = csv.writer(output_file, dialect='excel-tab')


    for gene in genes.values():
        for disjoint in gene:
            writer.writerow([
                disjoint['symbol'],
                disjoint['chr'],
                disjoint['txStart'],
                disjoint['txEnd'] - disjoint['txStart'],
                disjoint['strand'],
                disjoint['score'],
                ','.join((str(x) for x in run_length_encode(
                    disjoint['txStart'],
                    compute_union(disjoint['exonStarts'], disjoint['exonEnds']))
                ))
            ])


if __name__ == '__main__':
    main()
