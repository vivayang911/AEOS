import {redirect} from "next/navigation";

export default async function DecisionDetailRoute({params}:{params:Promise<{id:string}>}){
 const{id}=await params;
 redirect(`/decisions?decision=${encodeURIComponent(id)}`);
}
