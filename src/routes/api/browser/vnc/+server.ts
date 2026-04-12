import type { RequestHandler } from './$types';

const SECRET = () => process.env.BROWSER_SESSION_SECRET!;
const SESSION_URL = () => process.env.BROWSER_SESSION_URL!;

export const POST: RequestHandler = async () => {

  const base = SESSION_URL().replace(/\/+$/,'');

  try {

    const r = await fetch(`${base}/vnc-token`,{
      method:'POST',
      headers:{
        "x-session-secret":SECRET()
      }
    });

    const { nonce } = await r.json();

    if(!nonce) throw new Error("no nonce");

    const vncUrl =
      `${base}/proxy/vnc.html`
      + `?autoconnect=true`
      + `&reconnect=true`
      + `&path=proxy`
      + `&resize=scale`
      + `&password=${encodeURIComponent(SECRET().slice(0,8))}`
      + `&nonce=${encodeURIComponent(nonce)}`;

    return new Response(JSON.stringify({ vncUrl }),{
      headers:{ "Content-Type":"application/json" }
    });

  } catch(e:any){

    return new Response(JSON.stringify({
      error:e?.message
    }),{
      status:500,
      headers:{ "Content-Type":"application/json" }
    });

  }
};
