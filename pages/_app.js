import '../styles/globals.css';
import Head from 'next/head';
import Layout from '../components/Layout';

export default function MyApp({ Component, pageProps }) {
  const getLayout = Component.getLayout || ((page) => <Layout {...pageProps}>{page}</Layout>);
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
        <meta name="googlebot" content="index, follow" />
        <meta name="theme-color" content="#d32f2f" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      {getLayout(<Component {...pageProps} />, pageProps)}
    </>
  );
}
