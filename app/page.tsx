import Journal from './journal';
export const dynamic = 'force-dynamic';
export default async function Home({searchParams}:{searchParams:Promise<{view?:string}>}) {
  const {view}=await searchParams;
  return <Journal signedIn={false} initialView={view==='settings'?'settings':'overview'} />;
}
