import Journal from './journal';
import { getChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home({searchParams}:{searchParams:Promise<{view?:string}>}) {
  const user = await getChatGPTUser();
  const {view}=await searchParams;
  return <Journal signedIn={!!user} initialView={view==='settings'?'settings':'overview'} />;
}
