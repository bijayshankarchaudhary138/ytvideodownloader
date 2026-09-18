import PostView from '../../components/PostView';
import { getPostBySlug, getRecentPosts } from '../../lib/posts';

export default function PostPage({ post }) {
  if (!post) return <div className="text-center py-20"><h1 className="text-2xl font-bold">Post not found</h1><p className="mt-2">The page you are looking for does not exist.</p></div>;
  return <PostView post={post} />;
}

export async function getServerSideProps({ params }) {
  const post = getPostBySlug(params.slug);
  if (!post) {
    return { notFound: true };
  }
  return {
    props: { post: JSON.parse(JSON.stringify(post)) }
  };
}
