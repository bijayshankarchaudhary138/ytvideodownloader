import Link from 'next/link';
import { format, parseISO } from 'date-fns';

export default function PostView({ post }) {
  if (!post) return null;

  const dates = post.important_dates || {};
  const fee = post.application_fee || {};
  const age = post.age_limit || {};
  const vacancy = post.vacancy_details || [];
  const links = post.important_links || {};
  const faqs = post.faqs || [];

  const dateStr = post.post_date ? format(parseISO(post.post_date + 'T00:00:00'), 'dd MMMM yyyy') : '';
  const updateStr = post.update_date ? format(parseISO(post.update_date + 'T00:00:00'), 'dd MMMM yyyy') : dateStr;

  // JSON-LD structured data for SEO (rich snippets, job posting schema)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": post.category === 'results' ? "Article" : "JobPosting",
    "title": post.title,
    "description": post.short_info,
    "datePosted": post.post_date,
    ...(post.category === 'latest-jobs' && {
      "hiringOrganization": { "@type": "Organization", "name": post.organization },
      "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressCountry": "IN" } },
      "employmentType": "FULL_TIME",
      "validThrough": dates['Last Date for Apply Online'] ? '2026-12-31' : undefined,
    }),
    "publisher": { "@type": "Organization", "name": "Sarkari Result", "url": "/" }
  };

  return (
    <article className="bg-white border rounded">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Breadcrumb */}
      <div className="text-sm text-gray-600 p-3 border-b bg-gray-50">
        <Link href="/" className="hover:underline">Home</Link> »
        <Link href={`/${post.category}`} className="hover:underline ml-1"> {post.category.replace('-', ' ')}</Link> »
        <span className="ml-1">{post.title.substring(0, 50)}...</span>
      </div>

      {/* Post Header Table */}
      <div className="p-4">
        <table className="sarkari-table">
          <tbody>
            <tr>
              <td className="bg-gray-100 font-bold w-48"><strong>Name of Post:</strong></td>
              <td className="text-lg font-bold text-red-700">{post.title}</td>
            </tr>
            <tr>
              <td className="bg-gray-100 font-bold"><strong>Post Date / Update:</strong></td>
              <td>{updateStr} | {format(new Date(), 'hh:mm a')}</td>
            </tr>
            <tr>
              <td className="bg-gray-100 font-bold"><strong>Short Information:</strong></td>
              <td>{post.short_info}</td>
            </tr>
          </tbody>
        </table>

        {/* Social Share */}
        <div className="flex flex-wrap gap-3 my-4 text-sm">
          <a href="#" className="flex items-center gap-1 text-blue-500 hover:text-blue-700">
            📱 Telegram - Join Us
          </a>
          <a href="#" className="flex items-center gap-1 text-green-600 hover:text-green-700">
            💬 WhatsApp - Join Us
          </a>
          <a href="#" className="flex items-center gap-1 text-pink-600 hover:text-pink-700">
            📸 Instagram - Follow
          </a>
        </div>

        {/* Main Notification Table */}
        <div className="border-2 border-red-600 p-0 my-4">
          <div className="bg-red-600 text-white p-3 text-center font-bold">
            <div className="text-xl">{post.organization || 'Various Department'}</div>
            <div className="text-lg mt-1">{post.title} Short Details of Notification</div>
            <div className="text-sm mt-1 text-red-100">Sarkari Result® Official</div>
          </div>

          <table className="sarkari-table">
            <tbody>
              <tr>
                <td className="w-1/2 align-top">
                  <h3 className="font-bold text-red-700 mb-2">📅 Important Dates</h3>
                  <ul className="text-sm space-y-1">
                    {Object.entries(dates).map(([key, value]) => (
                      <li key={key}>• {key}: <strong>{value}</strong></li>
                    ))}
                    {Object.keys(dates).length === 0 && <li className="text-gray-500">• Dates to be announced</li>}
                  </ul>
                </td>
                <td className="w-1/2 align-top">
                  <h3 className="font-bold text-red-700 mb-2">💰 Application Fee</h3>
                  <ul className="text-sm space-y-1">
                    {Object.entries(fee).map(([key, value]) => {
                      if (key.startsWith('_')) return null;
                      return <li key={key}>• {key}: <strong>{value}</strong></li>;
                    })}
                    {fee._note && <li className="text-xs text-gray-600 mt-2">{fee._note}</li>}
                    {Object.keys(fee).filter(k => !k.startsWith('_')).length === 0 && <li className="text-gray-500">• Fee details in notification</li>}
                  </ul>
                </td>
              </tr>

              {Object.keys(age).length > 0 && (
                <tr>
                  <td colSpan={2} className="align-top">
                    <h3 className="font-bold text-red-700 mb-2">🎂 Age Limit {(age._note && `(${age._note || ''})`)}</h3>
                    <ul className="text-sm space-y-1 inline-block">
                      {Object.entries(age).map(([key, value]) => {
                        if (key.startsWith('_')) return null;
                        return <li key={key}>• {key}: <strong>{value}</strong></li>;
                      })}
                    </ul>
                    {age._note && <span className="ml-4 text-sm text-gray-700">{age._note}</span>}
                  </td>
                </tr>
              )}

              {vacancy.length > 0 && (
                <tr>
                  <td colSpan={2}>
                    <h3 className="font-bold text-red-700 mb-2">📊 Vacancy Details Total: {post.total_post || 'Various Post'}</h3>
                    <table className="sarkari-table mt-2">
                      <thead>
                        <tr>
                          <th>Post Name</th>
                          <th>Total Post</th>
                          <th>Eligibility</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vacancy.map((v, i) => (
                          <tr key={i}>
                            <td><strong>{v.name || v.postName || 'Post'}</strong></td>
                            <td className="text-center">{v.total || '-'}</td>
                            <td className="text-sm">{v.eligibility || v.qualification || 'Read Notification'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}

              <tr>
                <td colSpan={2}>
                  <h3 className="font-bold text-red-700 mb-2">📝 How to Fill {post.title.split(' Online Form')[0]} Online Form</h3>
                  <div className="text-sm space-y-1 whitespace-pre-line">
                    {post.how_to_apply || 'Kindly read the full notification before applying online.'}
                  </div>
                </td>
              </tr>

              <tr>
                <td colSpan={2} className="text-center">
                  <p className="font-bold text-red-700 text-sm">Interested Candidates Can Read the Full Notification Before Apply Online.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Important Links */}
        <div className="border-2 border-red-600">
          <div className="bg-red-600 text-white p-3 font-bold text-center">
            🔗 Some Useful Important Links
          </div>
          <table className="sarkari-table">
            <tbody>
              {Object.entries(links).map(([key, val]) => {
                if (typeof val === 'string') {
                  return (
                    <tr key={key}>
                      <td className="w-1/2 font-bold">{key}</td>
                      <td>
                        <a href={val} target="_blank" rel="nofollow noopener" className="btn-blue text-sm">Click Here</a>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={key}>
                    <td className="w-1/2 font-bold">{key}</td>
                    <td>
                      <a href={val.url} target="_blank" rel="nofollow noopener" className="btn-blue text-sm">{val.label || 'Click Here'}</a>
                    </td>
                  </tr>
                );
              })}
              {post.apply_link && !links['Apply Online'] && (
                <tr>
                  <td className="w-1/2 font-bold">Apply Online</td>
                  <td><a href={post.apply_link} target="_blank" rel="nofollow noopener" className="btn-red text-sm">Click Here</a></td>
                </tr>
              )}
              {post.notification_pdf && !links['Download Notification'] && (
                <tr>
                  <td className="w-1/2 font-bold">Download Notification</td>
                  <td><a href={post.notification_pdf} target="_blank" rel="nofollow noopener" className="btn-blue text-sm">Click Here</a></td>
                </tr>
              )}
              {post.official_website && !links['Official Website'] && (
                <tr>
                  <td className="w-1/2 font-bold">Official Website</td>
                  <td><a href={post.official_website} target="_blank" rel="nofollow noopener" className="btn-blue text-sm">Click Here</a></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FAQs */}
        {faqs.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold text-xl mb-4 text-red-700">Frequently Asked Questions (FAQ)</h3>
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div key={i} className="border-l-4 border-red-600 pl-4">
                  <p className="font-bold text-gray-800">Q{i+1}. {faq.q}</p>
                  <p className="text-gray-700 mt-1 text-sm">👉 {faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Note */}
        <div className="mt-6 p-4 bg-gray-50 border text-sm text-gray-700">
          <p className="mb-2">Welcome to this official website of Sarkari Result®.</p>
          <p className="mb-2">Thank you for visiting Sarkari Result. Through this website you will get information related to Job / Recruitment / Admission / Admit Card / Answer very easily.</p>
          <p className="text-xs text-gray-500">Disclaimer: The examination results, marks, notifications, and other content published on this website are provided for informational purpose only. Please verify all information with official website before applying.</p>
        </div>
      </div>
    </article>
  );
}
