/**
 * Seed the database with sample posts for demo purposes
 */
import db from '../lib/db.js';
import { generatePostContent } from '../lib/contentGenerator.js';

// Delete old sample data
db.prepare("DELETE FROM posts WHERE source_name = 'SEED'").run();

const samplePosts = [
  {
    organization: 'Staff Selection Commission (SSC)',
    examName: 'SSC CHSL 10+2 Combined Higher Secondary Level',
    totalPost: '2536',
    category: 'latest-jobs',
    applyStart: '07/09/2026',
    applyLast: '07/10/2026',
    feeLast: '08/10/2026',
    examDate: 'As per Schedule',
    feeGen: '100/-',
    ageMin: '18',
    ageMax: '27',
    qualification: '10+2 Intermediate Exam from Any Recognized Board in India.',
    applyLink: 'https://ssc.gov.in',
    notificationPdf: 'https://ssc.gov.in/notice.pdf',
    officialWebsite: 'https://ssc.gov.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Bihar Public Service Commission (BPSC)',
    examName: 'BPSC 70th Combined Competitive Exam CCE',
    totalPost: 'Various Post',
    category: 'latest-jobs',
    applyStart: '15/09/2026',
    applyLast: '30/09/2026',
    feeLast: '30/09/2026',
    feeGen: '600/-',
    feeSC: '150/-',
    feeFemale: '150/-',
    ageMin: '20',
    ageMax: '37',
    qualification: 'Bachelor Degree in Any Stream from Any Recognized University in India.',
    applyLink: 'https://bpsc.bih.nic.in',
    notificationPdf: 'https://bpsc.bih.nic.in/notice.pdf',
    officialWebsite: 'https://bpsc.bih.nic.in',
    sourceName: 'SEED',
    isTrending: true
  },
  {
    organization: 'Uttar Pradesh Public Service Commission (UPPSC)',
    examName: 'UPPSC PCS Pre Recruitment',
    totalPost: '250',
    category: 'latest-jobs',
    applyStart: '01/09/2026',
    applyLast: '03/10/2026',
    feeGen: '125/-',
    feeSC: '65/-',
    feeFemale: '65/-',
    ageMin: '21',
    ageMax: '40',
    qualification: 'Bachelor Degree in Any Stream.',
    applyLink: 'https://uppsc.up.nic.in',
    officialWebsite: 'https://uppsc.up.nic.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Institute of Banking Personnel Selection (IBPS)',
    examName: 'IBPS RRB CRP XV Office Assistant and Officer Scale',
    totalPost: '9500+',
    category: 'latest-jobs',
    applyStart: '02/09/2026',
    applyLast: '29/09/2026',
    feeGen: '850/-',
    feeSC: '175/-',
    ageMin: '18',
    ageMax: '30',
    qualification: 'Bachelor Degree in Any Stream from Recognized University.',
    applyLink: 'https://ibps.in',
    notificationPdf: 'https://ibps.in/crp-rrb.pdf',
    officialWebsite: 'https://ibps.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Railway Recruitment Board (RRB)',
    examName: 'Railway RRB NTPC Graduate Level',
    totalPost: '11000+',
    category: 'latest-jobs',
    applyStart: '10/09/2026',
    applyLast: '30/09/2026',
    feeGen: '500/-',
    feeSC: '250/-',
    feeFemale: '250/-',
    ageMin: '18',
    ageMax: '36',
    qualification: 'Bachelor Degree in Any Stream / 12th Pass as per post.',
    applyLink: 'https://rrb.gov.in',
    officialWebsite: 'https://rrcb.gov.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Uttar Pradesh Subordinate Services Selection Commission',
    examName: 'UPSSSC Junior Assistant 12-Exam/2024 Result',
    category: 'results',
    resultDate: '12/09/2026',
    applyLink: 'https://upsssc.gov.in/result',
    officialWebsite: 'https://upsssc.gov.in',
    sourceName: 'SEED',
    isTrending: true
  },
  {
    organization: 'National Testing Agency (NTA)',
    examName: 'NTA UGC NET June Exam Result',
    category: 'results',
    resultDate: '10/09/2026',
    applyLink: 'https://ugcnet.nta.ac.in/result',
    officialWebsite: 'https://nta.ac.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Staff Selection Commission (SSC)',
    examName: 'SSC CGL Tier I Result',
    category: 'results',
    resultDate: '08/09/2026',
    applyLink: 'https://ssc.gov.in/cgl-result',
    officialWebsite: 'https://ssc.gov.in',
    sourceName: 'SEED'
  },
  {
    organization: 'State Bank of India (SBI)',
    examName: 'SBI Junior Associate Clerk Admit Card',
    category: 'admit-card',
    admitCardDate: '10/09/2026',
    examDate: 'October 2026',
    applyLink: 'https://sbi.co.in/careers/admit',
    officialWebsite: 'https://sbi.co.in',
    sourceName: 'SEED',
    isTrending: true
  },
  {
    organization: 'Uttar Pradesh Subordinate Services Selection Commission',
    examName: 'UPSSSC Lekhpal 02-Exam/2025 Admit Card',
    category: 'admit-card',
    admitCardDate: '12/09/2026',
    examDate: '22/09/2026',
    applyLink: 'https://upsssc.gov.in/admit',
    officialWebsite: 'https://upsssc.gov.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Indian Navy',
    examName: 'Navy SSR / MR INET Stage II Admit Card',
    category: 'admit-card',
    admitCardDate: '08/09/2026',
    applyLink: 'https://joinindiannavy.gov.in',
    officialWebsite: 'https://www.joinindiannavy.gov.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Staff Selection Commission (SSC)',
    examName: 'SSC CGL 2026 Answer Key',
    category: 'answer-key',
    applyLink: 'https://ssc.gov.in/answerkey',
    officialWebsite: 'https://ssc.gov.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Bihar School Examination Board (BSEB)',
    examName: 'Bihar STET Secondary and Senior Secondary Online Form',
    totalPost: 'Various Post',
    category: 'latest-jobs',
    applyStart: '05/09/2026',
    applyLast: '25/09/2026',
    feeGen: '900/-',
    feeSC: '700/-',
    feeFemale: '700/-',
    ageMin: '21',
    ageMax: '37',
    qualification: 'Bachelor Degree / Master Degree with B.Ed.',
    applyLink: 'https://bsebstet.com',
    officialWebsite: 'https://biharboardonline.com',
    sourceName: 'SEED'
  },
  {
    organization: 'Madhya Pradesh Employees Selection Board',
    examName: 'MPESB Group 3 Sub Engineer Recruitment',
    totalPost: '528',
    category: 'latest-jobs',
    applyStart: '01/09/2026',
    applyLast: '20/09/2026',
    feeGen: '500/-',
    feeSC: '250/-',
    ageMin: '18',
    ageMax: '40',
    qualification: 'Diploma / Degree in Engineering Related Trade.',
    applyLink: 'https://esb.mp.gov.in',
    officialWebsite: 'https://esb.mp.gov.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Indian Army',
    examName: 'Army Agniveer Rally Recruitment Online Form',
    totalPost: '25000+',
    category: 'latest-jobs',
    applyStart: '10/09/2026',
    applyLast: '10/10/2026',
    feeGen: '250/-',
    feeSC: '250/-',
    feeFemale: '250/-',
    ageMin: '17.5',
    ageMax: '21',
    qualification: '8th / 10th / 12th Pass as per post.',
    applyLink: 'https://joinindianarmy.nic.in',
    officialWebsite: 'https://joinindianarmy.nic.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Haryana Public Service Commission',
    examName: 'HPSC HCS Civil Services Mains Result',
    category: 'results',
    resultDate: '05/09/2026',
    applyLink: 'https://hpsc.gov.in/result',
    officialWebsite: 'https://hpsc.gov.in',
    sourceName: 'SEED'
  },
  {
    organization: 'Central Board of Secondary Education',
    examName: 'CBSE CTET July Exam Answer Key',
    category: 'answer-key',
    applyLink: 'https://ctet.nic.in',
    officialWebsite: 'https://www.cbse.gov.in',
    sourceName: 'SEED'
  },
  {
    organization: 'India Post',
    examName: 'India Post GDS Gramin Dak Sevak Online Form',
    totalPost: '44228',
    category: 'latest-jobs',
    applyStart: '01/08/2026',
    applyLast: '10/09/2026',
    feeGen: '100/-',
    feeSC: '0/-',
    feeFemale: '0/-',
    ageMin: '18',
    ageMax: '40',
    qualification: '10th High School Passed with Math, English and Local Language.',
    applyLink: 'https://indiapostgdsonline.gov.in',
    officialWebsite: 'https://www.indiapost.gov.in',
    sourceName: 'SEED'
  },
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO posts (
    slug, title, short_info, category, post_type, organization, total_post,
    post_date, update_date, important_dates, application_fee, age_limit,
    vacancy_details, eligibility, how_to_apply, important_links, faqs,
    notification_pdf, apply_link, official_website, meta_keywords, meta_description,
    source_url, source_name, is_trending
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let count = 0;
samplePosts.forEach((p, idx) => {
  const content = generatePostContent(p);
  const slug = content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 70) + '-' + Date.now().toString().slice(-3) + idx;

  try {
    insert.run(
      slug,
      content.title,
      content.short_info,
      content.category,
      content.post_type,
      content.organization,
      content.total_post,
      new Date(Date.now() - Math.floor(Math.random() * 14) * 86400000).toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10),
      JSON.stringify(content.important_dates),
      JSON.stringify(content.application_fee),
      JSON.stringify(content.age_limit),
      JSON.stringify(content.vacancy_details),
      JSON.stringify(content.eligibility),
      content.how_to_apply,
      JSON.stringify(content.important_links),
      JSON.stringify(content.faqs),
      content.notification_pdf,
      content.apply_link,
      content.official_website,
      content.meta_keywords,
      content.meta_description,
      p.sourceUrl || '',
      'SEED',
      p.isTrending ? 1 : 0
    );
    count++;
  } catch(e) {
    console.error('Error seeding:', e.message);
  }
});

console.log(`✅ Seeded ${count} sample posts successfully!`);
