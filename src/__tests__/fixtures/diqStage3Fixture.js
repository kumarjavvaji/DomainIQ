// Test fixture — DIQ Stage 3 synthesis about AI-Assisted Product Discovery / trust / PDLC

export const DIQ_STAGE3_AI_PDLC_FIXTURE = {
  id: 'v4s_test_001',
  entity: { name: 'AI-Assisted Product Discovery', type: 'domain' },
  stage2: { id: 'stage2_001' },
  stage3: {
    id:                    'stage3_001',
    stageNumber:           3,
    generatedAt:           1718000000000,
    generatedFromStage2Id: 'stage2_001',

    thesis: {
      text:       'AI-assisted product discovery tools are reshaping how product teams build stakeholder trust, reducing bias in requirements gathering and accelerating validated roadmap decisions.',
      rationale:  'Multiple converging signals — adoption patterns, tooling maturity, and team workflow changes — confirm that AI PDLC tools are past the early-adopter phase and entering mainstream product practice.',
      confidence: 'High',
    },

    evidenceMap: [
      {
        observation:   'Product teams using AI discovery tools report 40% faster alignment on requirements with engineering stakeholders.',
        evidenceBasis: 'Multiple case studies from mid-market SaaS companies validated by Stage 2 retrieval.',
        implication:   'Speed of alignment is a differentiator — resume should emphasize facilitation and cross-functional trust-building.',
        strength:      'Strong',
        scope:         'industry',
        lineageRef:    'n2',
      },
      {
        observation:   'AI summarization of user interviews is reducing qualitative research bottlenecks in teams with 2–5 PMs.',
        evidenceBasis: 'Inferred from tooling adoption signals — no direct survey data confirmed.',
        implication:   'Relevant for teams where research bandwidth is limited.',
        strength:      'Moderate',
        scope:         'workflow',
        lineageRef:    'n4',
      },
      {
        observation:   'Some organizations report AI PDLC tools creating false confidence in low-signal data.',
        evidenceBasis: 'Anecdotal reports from practitioner blogs — not peer-reviewed.',
        implication:   'Do not claim AI tools improve research quality without caveats.',
        strength:      'Weak',
        scope:         'industry',
        lineageRef:    'n6',
      },
    ],

    insightClusters: [
      {
        title:               'Trust Engineering',
        insight:             'Product teams that instrument discovery with AI tooling are building more defensible roadmaps and reducing stakeholder challenge cycles.',
        supportingEvidence:  ['40% faster alignment finding', 'Tooling adoption signals'],
        whyItMatters:        'Stakeholder trust is a recurring blocker in PDLC — tooling that reduces it has clear value.',
        strategicImplication: 'Resume should position candidate as someone who builds cross-functional trust through structured discovery.',
        confidence:          'High',
      },
      {
        title:               'Research Bottleneck Relief',
        insight:             'AI summarization reduces manual qualitative research effort, enabling faster insight synthesis.',
        supportingEvidence:  ['Tooling adoption in small PM teams'],
        whyItMatters:        'Teams with limited research bandwidth benefit most.',
        strategicImplication: 'Useful framing for companies where PMs own research end-to-end.',
        confidence:          'Medium',
      },
    ],

    strategicImplications: [
      {
        implication:   'Candidates with AI-augmented discovery skills are increasingly preferred in product roles at data-forward companies.',
        relevance:     'Directly applicable to resume positioning for product roles at SaaS companies.',
        evidenceBasis: 'Confirmed through job posting analysis and practitioner surveys.',
        confidence:    'High',
        stakeholders:  'Hiring managers, product leaders',
      },
      {
        implication:   'Product teams that delay AI PDLC adoption risk slower time-to-validated-decision.',
        relevance:     'Supporting context — useful for cover letter framing.',
        evidenceBasis: 'Inferred from competitive pressure signals.',
        confidence:    'Medium',
        stakeholders:  'Product directors, CPOs',
      },
    ],

    strategicOptions: [
      {
        title:             'Position as AI-Augmented Discovery Lead',
        description:       'Frame experience around structured, AI-assisted discovery processes that build cross-functional trust.',
        plausibilityLevel: 'High',
        evidenceSupporting: 'Strong thesis + trust engineering insight cluster.',
        evidenceAgainst:   'Risk of overstating AI involvement if tooling is peripheral.',
      },
    ],

    risksConstraintsUnknowns: [
      {
        item:                  'AI tooling overstated in positioning without direct product ownership of AI features',
        whyItMatters:          'Resume claims about AI must reflect actual work scope, not general exposure.',
        consequenceIfIgnored:  'Interview scrutiny may reveal shallow AI experience — damages credibility.',
        investigationPath:     'Clarify specific AI tools used and actual contribution vs. peripheral observation.',
      },
    ],

    audienceConfidenceNotes: {
      reasoningPath:            'Evidence chain from Stage 1 → Stage 2 → Stage 3 is traceable and defensible.',
      defensibilityNotes:       'Strong items are defensible. Moderate items need qualification in resume copy.',
      trustRequirements:        ['Candidate should have direct experience with AI-assisted discovery tools'],
      tradeoffsToAcknowledge:   ['AI PDLC is a fast-moving space — some evidence may become outdated quickly'],
      evidenceGaps:             ['No direct survey data on PM hiring preference for AI skills'],
    },

    stage4Readiness: {
      status:                'Partially Ready',
      rationale:             'Strong thesis with some evidence gaps.',
      missingInputs:         ['Candidate-specific AI tool experience', 'Quantified impact metrics from candidate background'],
      artifactCandidates:    ['Resume positioning strategy'],
      suggestedArtifactType: 'Positioning strategy document',
    },

    stage5LearningSignals: [],

    strategyMenu: [
      {
        id:                'sm_001',
        strategyName:      'AI Discovery Trust Builder',
        investmentPosture: 'double down',
        outcomeServed:     'Position candidate as trusted discovery partner in AI-forward product teams.',
        whatThisMeans:     'Lead with structured discovery skills and AI augmentation, backed by measurable stakeholder trust outcomes.',
        evidenceSupporting: 'Strong thesis + trust engineering insight cluster.',
        evidenceAgainst:   'Risk of overstating if AI involvement was peripheral.',
      },
      {
        id:                'sm_002',
        strategyName:      'Research Efficiency Angle',
        investmentPosture: 'selective investment',
        outcomeServed:     'Position candidate as high-throughput research synthesizer.',
        whatThisMeans:     'Emphasize volume of insights synthesized and speed of decision support.',
        evidenceSupporting: 'Research bottleneck relief insight cluster.',
        evidenceAgainst:   'Moderate confidence — may not resonate at all companies.',
      },
    ],
  },
}
