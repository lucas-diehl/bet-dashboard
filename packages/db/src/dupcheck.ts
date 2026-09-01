import { sql } from "drizzle-orm";
import { openDb } from "./upsert";
import { loadEnv } from "./env";
loadEnv();
const h = openDb(process.env.DATABASE_URL!);
const q = async (s: any) => (await h.db.execute(s)) as unknown as any[];
const logical = await q(sql`SELECT source, slate_date, market, selection, coalesce(details->>'opponent','') opp, count(*) c
  FROM bets GROUP BY 1,2,3,4,5 HAVING count(*)>1 ORDER BY c DESC LIMIT 20`);
console.log("LOGICAL DUPS:", logical.length ? logical : "none");
const ids = await q(sql`SELECT source, bet_id, count(*) c FROM bets GROUP BY 1,2 HAVING count(*)>1 LIMIT 10`);
console.log("BET_ID DUPS:", ids.length ? ids : "none (unique)");
const bysport = await q(sql`SELECT sport, count(*) c, sum((result is not null and result<>'pending')::int) graded FROM bets b LEFT JOIN results r ON r.source=b.source AND r.bet_id=b.bet_id GROUP BY 1 ORDER BY c DESC`);
console.log("BY SPORT:", bysport);
await h.close();
