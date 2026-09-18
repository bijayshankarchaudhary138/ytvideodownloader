/**
 * Content generator (CommonJS version for scraper)
 */

function generatePostContent(rawData) {
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
    feeSC = '0/-',
    feeST = '0/-',
    feePH = '0/-',
    feeFemale = '0/-',
    ageMin = '',
    ageMax = '',
    ageRelax = '',
    qualification = '',
    eligibility = '',
    applyLink = '',
    notificationPdf = '',
    officialWebsite = '',
    vacancyDetails = [],
    extraDates = [],
    extraLinks = {}
  } = rawData;

  const title = buildTitle(rawData);
  const shortInfo = buildShortInfo(rawData);
  const metaKeywords = buildMetaKeywords(rawData);
  const metaDescription = buildMetaDescription(rawData);
  const year = new Date().getFullYear();

  const importantDates = {};
  if (applyStart) importantDates['Application Begin'] = applyStart;
  if (applyLast) importantDates['Last Date for Apply Online'] = applyLast + ' upto 11 PM Only';
  if (feeLast) importantDates['Pay Exam Fee Last Date'] = feeLast;
  if (correctionDate) importantDates['Correction Date'] = correctionDate;
  if (examDate) importantDates['Exam Date'] = examDate;
  if (admitCardDate) importantDates['Admit Card Available'] = admitCardDate;
  if (resultDate) importantDates['Result Declared'] = resultDate;
  extraDates.forEach(d => { importantDates[d.label] = d.value; });

  const applicationFee = {};
  if (feeGen) applicationFee['General / OBC / EWS'] = feeGen;
  if (feeSC) applicationFee['SC / ST'] = feeSC;
  if (feePH) applicationFee['PH (Divyang)'] = feePH;
  if (feeFemale) applicationFee['Female'] = feeFemale;
  applicationFee['_note'] = 'Pay the Examination Fee Through Debit Card, Credit Card, Net Banking or E Challan Mode Only';

  const ageLimit = {};
  if (ageMin) ageLimit['Minimum Age'] = ageMin + ' Years';
  if (ageMax) ageLimit['Maximum Age'] = ageMax + ' Years';
  ageLimit['_note'] = ageRelax || 'Age Relaxation Extra as per Recruitment Rules.';

  const vacDetails = vacancyDetails.length > 0 ? vacancyDetails : [
    { name: postName || examName || 'Various Post', total: totalPost, eligibility: qualification || eligibility }
  ];

  const howToApply = buildHowToApply(rawData);

  const importantLinks = {};
  if (applyLink) importantLinks['Apply Online'] = { url: applyLink, label: 'Click Here' };
  if (notificationPdf) importantLinks['Download Notification'] = { url: notificationPdf, label: 'Click Here' };
  if (officialWebsite) importantLinks['Official Website'] = { url: officialWebsite, label: 'Click Here' };
  Object.assign(importantLinks, extraLinks);

  const faqs = buildFAQs(rawData);

  return {
    title, short_info: shortInfo, category, post_type: postType, organization,
    total_post: totalPost, important_dates: importantDates, application_fee: applicationFee,
    age_limit: ageLimit, vacancy_details: vacDetails, eligibility: { qualification },
    how_to_apply: howToApply, important_links: importantLinks, faqs,
    apply_link: applyLink, notification_pdf: notificationPdf, official_website: officialWebsite,
    meta_keywords: metaKeywords, meta_description: metaDescription
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
  if (d.category === 'results') return `${org} has released the result for ${name} ${year}. All candidates who appeared in the examination can check their result now. Direct link to check the result is given below at Sarkari Result Official Website.`;
  if (d.category === 'admit-card') return `${org} has released the admit card for ${name} ${year}. Those candidates who are enrolled with this vacancy can download their admit card from the link given below.`;
  if (d.category === 'answer-key') return `${org} has released the answer key for ${name} ${year}. Candidates can download the answer key and check their answers. Objection window will be open as per schedule.`;
  return `${org} has released the notification for ${name}${d.totalPost ? ` Recruitment ${year} for ${d.totalPost} posts` : ` ${year}`}. Those candidates who are interested can apply online from ${d.applyStart || 'starting date'} to ${d.applyLast || 'last date'}. Before applying, candidates must read the complete notification.`;
}

function buildMetaKeywords(d) {
  const org = d.organization || '';
  const name = d.examName || d.postName || '';
  const year = new Date().getFullYear();
  return `${org} ${name}, ${org} ${name} ${year}, Sarkari Result, ${name} Online Form, ${name} Apply Online, ${org} Notification, Sarkari Result ${name}, Latest Sarkari Jobs, ${org} Recruitment ${year}, ${name} Admit Card, ${name} Result, Govt Jobs, Sarkari Exam`;
}

function buildMetaDescription(d) {
  const org = d.organization || '';
  const name = d.examName || d.postName || 'recruitment';
  const year = new Date().getFullYear();
  return `${org} ${name} ${year} - Check notification details including important dates, application fee, age limit, eligibility, vacancy details and apply online link at Sarkari Result. Candidates can apply online before last date ${d.applyLast || ''}.`;
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
- Take A Print Out of Final Submitted Form.`;
}

function buildFAQs(d) {
  const org = d.organization || '';
  const name = d.examName || d.postName || 'this post';
  const year = new Date().getFullYear();
  return [
    { q: `When did the ${org} ${name} ${year} Online Application Process Start?`, a: `The online application process started on ${d.applyStart || 'announced date'}.` },
    { q: `What is the last date to apply online for ${org} ${name} ${year}?`, a: `The last date to apply online is ${d.applyLast || 'as per notification'}.` },
    { q: `What is the application fee?`, a: `Application fee for General / OBC / EWS is ${d.feeGen || 'as per notification'}, for SC/ST and Female/PH candidates fee exemption as per rules.` },
    { q: `What is the age limit for ${org} ${name} ${year}?`, a: `Minimum age is ${d.ageMin || '18'} years and maximum age is ${d.ageMax || 'as per notification'} years. Age relaxation extra as per rules.` },
    { q: `How can I apply for ${org} ${name} ${year}?`, a: `Candidates can apply online through the official recruitment link available on this page. Click on Apply Online link given in important links section.` },
    { q: `What is the educational qualification required?`, a: d.qualification || d.eligibility || 'Candidates must read the official notification for complete educational qualification details.' },
    { q: `When will the exam be conducted?`, a: d.examDate ? `Exam date is ${d.examDate}. Admit card will be available before exam.` : 'Exam date will be announced soon. Keep visiting for latest updates.' },
  ];
}

function autoGenerateFromNotification(title, sourceUrl) {
  const lowerTitle = title.toLowerCase();
  let category = 'latest-jobs';
  if (lowerTitle.includes('result') || lowerTitle.includes('merit list') || lowerTitle.includes('selected candidate')) category = 'results';
  else if (lowerTitle.includes('admit card') || lowerTitle.includes('call letter') || lowerTitle.includes('hall ticket')) category = 'admit-card';
  else if (lowerTitle.includes('answer key')) category = 'answer-key';
  else if (lowerTitle.includes('syllabus')) category = 'syllabus';
  else if (lowerTitle.includes('admission')) category = 'admission';
  else if (lowerTitle.includes('scholarship')) category = 'scholarship';

  let officialWebsite = '';
  try { officialWebsite = new URL(sourceUrl).origin; } catch {}

  return generatePostContent({ examName: title, category, sourceUrl, notificationPdf: sourceUrl, applyLink: sourceUrl, officialWebsite });
}

module.exports = { generatePostContent, autoGenerateFromNotification };
