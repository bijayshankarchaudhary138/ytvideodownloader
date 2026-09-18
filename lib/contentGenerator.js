/**
 * SarkariResult-style content generator
 * Creates properly formatted posts matching the exact sarkariresult.com format
 * for maximum SEO and user familiarity
 */

export function generatePostContent(rawData) {
  const {
    organization = 'Various Department',
    examName = '',
    postName = '',
    totalPost = '',
    category = 'latest-jobs',
    postType = 'online_form',
    applyStart = '',
    applyLast = '',
    feeLast = '',
    examDate = '',
    admitCardDate = '',
    resultDate = '',
    correctionDate = '',
    feeGen = '',
    feeOBC = feeGen,
    feeSC = '0/-',
    feeST = '0/-',
    feePH = '0/-',
    feeFemale = '0/-',
    ageMin = '',
    ageMax = '',
    ageRelax = '',
    eligibility = '',
    qualification = '',
    applyLink = '',
    notificationPdf = '',
    officialWebsite = '',
    vacancyDetails = [], // [{postName, total, eligibility}]
    extraDates = [],
    extraLinks = {}
  } = rawData;

  const title = buildTitle(rawData);
  const shortInfo = buildShortInfo(rawData);
  const metaKeywords = buildMetaKeywords(rawData);
  const metaDescription = buildMetaDescription(rawData);

  const importantDates = {
    ...(applyStart && { 'Application Begin': applyStart }),
    ...(applyLast && { 'Last Date for Apply Online': applyLast + (applyLast && !applyLast.includes('upto') ? ' upto 11 PM Only' : '') }),
    ...(feeLast && { 'Pay Exam Fee Last Date': feeLast }),
    ...(correctionDate && { 'Correction Date': correctionDate }),
    ...(examDate && { 'Exam Date': examDate }),
    ...(admitCardDate && { 'Admit Card Available': admitCardDate }),
    ...(resultDate && { 'Result Declared': resultDate }),
    ...Object.fromEntries(extraDates.map(d => [d.label, d.value]))
  };

  const applicationFee = {
    ...(feeGen && { 'General / OBC / EWS': feeGen }),
    ...(feeSC && { 'SC / ST': feeSC }),
    ...(feePH && { 'PH (Divyang)': feePH }),
    ...(feeFemale && { 'Female': feeFemale }),
    '_note': 'Pay the Examination Fee Through Debit Card, Credit Card, Net Banking or E Challan Mode Only'
  };

  const ageLimit = {
    ...(ageMin && { 'Minimum Age': ageMin + ' Years' }),
    ...(ageMax && { 'Maximum Age': ageMax + ' Years' }),
    '_note': ageRelax || 'Age Relaxation Extra as per Recruitment Rules.'
  };

  const vacDetails = vacancyDetails.length > 0 ? vacancyDetails : [
    { name: postName || 'Various Post', total: totalPost, eligibility: qualification || eligibility }
  ];

  const howToApply = buildHowToApply(rawData);
  const importantLinks = {
    ...(applyLink && { 'Apply Online': { url: applyLink, label: 'Click Here' } }),
    ...(notificationPdf && { 'Download Notification': { url: notificationPdf, label: 'Click Here' } }),
    ...(officialWebsite && { 'Official Website': { url: officialWebsite, label: 'Click Here' } }),
    ...extraLinks
  };

  const faqs = buildFAQs(rawData);

  return {
    title,
    short_info: shortInfo,
    category,
    post_type: postType,
    organization,
    total_post: totalPost,
    important_dates: importantDates,
    application_fee: applicationFee,
    age_limit: ageLimit,
    vacancy_details: vacDetails,
    eligibility: { qualification },
    how_to_apply: howToApply,
    important_links: importantLinks,
    faqs,
    apply_link: applyLink,
    notification_pdf: notificationPdf,
    official_website: officialWebsite,
    meta_keywords: metaKeywords,
    meta_description: metaDescription
  };
}

function buildTitle(d) {
  const org = d.organization || '';
  const name = d.examName || d.postName || 'Recruitment';
  const year = new Date().getFullYear();
  const total = d.totalPost ? ` for ${d.totalPost} Post` : '';

  if (d.category === 'results') return `${org} ${name} Result ${year}`;
  if (d.category === 'admit-card') return `${org} ${name} Admit Card ${year}`;
  if (d.category === 'answer-key') return `${org} ${name} Answer Key ${year}`;
  if (d.category === 'admission') return `${org} ${name} Admission Form ${year}`;
  if (d.category === 'scholarship') return `${org} ${name} Scholarship Form ${year}`;

  return `${org} ${name} Online Form ${year}${total}`;
}

function buildShortInfo(d) {
  const org = d.organization || 'The organization';
  const name = d.examName || d.postName || 'latest recruitment';
  const year = new Date().getFullYear();

  if (d.category === 'results') {
    return `${org} has released the result for ${name} ${year}. All candidates who appeared in the examination can check their result now. Direct link to check the result is given below at Sarkari Result Official Website.`;
  }
  if (d.category === 'admit-card') {
    return `${org} has released the admit card for ${name} ${year}. Those candidates who are enrolled with this vacancy can download their admit card from the link given below.`;
  }
  if (d.category === 'answer-key') {
    return `${org} has released the answer key for ${name} ${year}. Candidates can download the answer key and check their answers. Objection window will be open as per schedule.`;
  }

  return `${org} has released the notification for ${name}${d.totalPost ? ` Recruitment ${year} for ${d.totalPost} posts` : ` ${year}`}. Those candidates who are interested can apply online from ${d.applyStart || 'starting date'} to ${d.applyLast || 'last date'}. Before applying, candidates must read the complete notification in which selection procedure, exam syllabus, pattern, exam date and other information will be available.`;
}

function buildMetaKeywords(d) {
  const org = d.organization || '';
  const name = d.examName || d.postName || '';
  const year = new Date().getFullYear();
  return [
    `${org} ${name}`,
    `${org} ${name} ${year}`,
    `Sarkari Result`,
    `${name} Online Form`,
    `${name} Apply Online`,
    `${org} Notification`,
    `${name} ${year} Notification`,
    `Sarkari Result ${name}`,
    `Latest Sarkari Jobs`,
    `${org} Recruitment ${year}`,
    `${name} Admit Card`,
    `${name} Result`,
    `Govt Jobs`,
    `Sarkari Exam`
  ].join(', ');
}

function buildMetaDescription(d) {
  const org = d.organization || '';
  const name = d.examName || d.postName || 'recruitment';
  const year = new Date().getFullYear();
  return `${org} ${name} ${year} - Check ${name} notification details including important dates, application fee, age limit, eligibility, vacancy details, apply online link and other important information at Sarkari Result. Candidates can apply online before last date ${d.applyLast || ''}.`;
}

function buildHowToApply(d) {
  const org = d.organization || '';
  const name = d.examName || d.postName || 'this recruitment';
  return `${org} ${name} Recruitment Candidate Can Apply Between ${d.applyStart || 'Start Date'} to ${d.applyLast || 'Last Date'}.
- Candidate Read the Notification Before Apply the Recruitment Application Form.
- Kindly Check and Collect the All Document - Eligibility, ID Proof, Address Details, Basic Details.
- Kindly Ready Scan Document Related to Recruitment Form - Photo, Sign, ID Proof, Etc.
- Before Submit the Application Form Must Check the Preview and All Column Carefully.
- If Candidate Required to Paying the Application Fee Must Submit. If You have Not the Required Application Fees Your Form is Not Completed.
- Take A Print Out of Final Submitted Form.
- For the latest updates on Sarkari Result, admit card, answer key, and result, always visit our website.`;
}

function buildFAQs(d) {
  const org = d.organization || '';
  const name = d.examName || d.postName || 'this post';
  const year = new Date().getFullYear();
  const faqs = [
    { q: `When did the ${org} ${name} ${year} Online Application Process Start?`, a: `The online application process started on ${d.applyStart || 'announced date'}.` },
    { q: `What is the last date to apply online for ${org} ${name} ${year}?`, a: `The last date to apply online is ${d.applyLast || 'as per notification'}.` },
    { q: `What is the application fee?`, a: `Application fee for General / OBC / EWS is ${d.feeGen || 'as per notification'}, for SC / ST candidates is ${d.feeSC || '0/-'}, and for Female / PH candidates is ${d.feePH || d.feeFemale || '0/-'}.` },
    { q: `What is the age limit for ${org} ${name} ${year}?`, a: `Minimum age is ${d.ageMin || '18'} years and maximum age is ${d.ageMax || 'as per notification'} years. Age relaxation extra as per rules.` },
    { q: `How many total posts are there in ${org} ${name} ${year}?`, a: `Total posts are ${d.totalPost || 'as per notification'}.` },
    { q: `How can I apply for ${org} ${name} ${year}?`, a: `Candidates can apply online through the official recruitment link available on this page. Click on Apply Online link given in important links section.` },
    { q: `What is the educational qualification required?`, a: d.qualification || d.eligibility || 'Candidates must read the official notification for complete educational qualification details.' },
    { q: `When will the exam be conducted?`, a: d.examDate ? `Exam date is ${d.examDate}. Admit card will be available before exam.` : 'Exam date will be announced soon. Keep visiting for latest updates.' },
  ];
  return faqs;
}

/**
 * Generates a complete post from official notification text/URL
 * Auto-detects what kind of notification it is (form, result, admitcard)
 */
export function autoGenerateFromNotification(title, sourceUrl = '') {
  const lowerTitle = title.toLowerCase();
  let category = 'latest-jobs';
  let postType = 'online_form';

  if (lowerTitle.includes('result') || lowerTitle.includes('merit list') || lowerTitle.includes('selected candidate')) {
    category = 'results';
    postType = 'result';
  } else if (lowerTitle.includes('admit card') || lowerTitle.includes('call letter') || lowerTitle.includes('hall ticket')) {
    category = 'admit-card';
    postType = 'admit_card';
  } else if (lowerTitle.includes('answer key')) {
    category = 'answer-key';
    postType = 'answer_key';
  } else if (lowerTitle.includes('syllabus')) {
    category = 'syllabus';
    postType = 'syllabus';
  } else if (lowerTitle.includes('admission')) {
    category = 'admission';
    postType = 'admission';
  } else if (lowerTitle.includes('scholarship')) {
    category = 'scholarship';
    postType = 'scholarship';
  }

  return generatePostContent({
    examName: title,
    category,
    postType,
    sourceUrl,
    notificationPdf: sourceUrl,
    applyLink: sourceUrl,
    officialWebsite: extractDomain(sourceUrl)
  });
}

function extractDomain(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}
