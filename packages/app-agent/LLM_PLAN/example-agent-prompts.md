# Example Prompts for the Agent

Most of these work fine with both gpt-5.4-mini and Qwen3.6 35B MoE. Some are still a bit too difficult.

## Mouse Cancer Cell Line Atlas (MCCA)

- Show how expression of Pten and Sox2 correlate.
- Show how Pten expression and copy number correlate.
- Show only the five most abundant cancer types.
- Keep samples belonging to the top 5 most abundant cancer types.
- Show a plot that compares survival days of the top five most abundant cancer types.
- Compare survival of mice with and without deep Pten deletion using copy-number data. Make a plot.
- Myc copy number vs. survival.
- Show samples grouped into top and bottom quartiles by survival.
- Mice without Sry gene (i.e., very low copy number) are unlikely to be male. Check if this is concordant with the Gender attribute. Show a plot.
- I think it's a bit suspicious that some but not all females have deep Y chromosome deletion in the data.
- Group into survival quartiles and remove the group that contains value 300.
- Group into survival quartiles and remove the two middle groups.
- Show only samples in the top and bottom quartiles by survival.

## FUSE

- How to read the RefSeq genes track?
- Show Repeat Masker and explain the red bars in it.
- I'd like to see the samples grouped into quartiles by the mean beta in chr17:4,325,078-4,337,793.
- I'd like to have mean beta in chr17:4,325,078-4,337,793 as a metadata attribute and the samples grouped into quartiles by it.
- I'd like to have mean beta in BRCA1 locus as a metadata attribute and the samples grouped into quartiles by the newly added attribute.
- If I would like to have you group by mean instead, what would you do?
- Show stomach samples
- Add mean beta of TP53 and BRCA1 loci to metadata.
- Show how mean beta of TP53 and BRCA1 loci correlate.

## GenomeSpy Paper

- Show one representative sample from each patient, the one with the highest purity.
- What are those red circles all over the visualization?
- Add mean copy number of NF1 gene to metadata.
- Group samples by NF1 gene copy number.
- Show only samples with very high number of breaks.
- Group by patient, then show boxplot of mutation counts.
- Show a box plot that compares mean copy number over the ERBB2 gene across patients.
- Show how mean copy number over the ERBB2 gene compares across patients. Use all samples from each patient, not just one representative sample.
- Show a plot on how copy number compares across patients in the current selection.
- What's the average copy number in the q arm of chromosome 6?
- Group the samples into early (primary + interval) and late (relapse) groups.
- Keep only samples with "stopgain" mutations within chr12:32,863,050-118,204,492.
- Using the current selection brush, add the number of "stopgain" mutations to metadata.
- Group the samples into two groups based on the presence of stopgain mutations in the 12q14.3 locus.
- Are there stopgain mutations in the 12q14.3 locus?
- Show only patients who have stopgain mutations in the 12q14.3 locus. All samples from those patients should be shown.
- Keep only samples with amplifications within the current brush selection. Amplification is 2x current ploidy.
- Identify samples that have an amplification in the 13q34 locus.
- Group by patient, plot sampleTime, and tell me about "interval" in the plot. Also explain what the colors mean.
- How does CCNE1 gene copy number and ploidy correlate?
- I'm interested in MECOM, MYC, and CCNE1 genes. Which has the highest variability in copy numbers across the samples? Do it as follows: select gene regions one by one. After each selection, derive a metadata attribute. Once all attributes are there, query the attribute summaries and tell me how you interpret them.
- I'm interested in MECOM, MYC, and CCNE1 genes. Which has the highest variability in copy number across the samples?
- Add a new metadata column indicating whether there are missense mutations within the current selection brush.
-
