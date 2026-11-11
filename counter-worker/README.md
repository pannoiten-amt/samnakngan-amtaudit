# ตัวนับผู้เข้าชม (Cloudflare Worker)

Worker ตัวนี้ยังไม่ได้ deploy ตัวเลขบนเว็บจะไม่ขึ้นจนกว่าจะ deploy แล้วเปลี่ยนค่า `AMT_VISITOR_COUNTER_ENDPOINT` ใน `assets/visitor-counter.js`

ตอนตัวเลขขึ้น จะเป็นป้ายสีขาวบนฟุตเตอร์สีเข้ม ตัวเลขสีน้ำเงินตัวหนา และไอคอนคนบนวงกลมสีส้มของแบรนด์ ถ้า endpoint ยังเป็น placeholder หรือเรียกไม่ติด ป้ายนี้ถูกซ่อนไว้ ไม่ดันเลย์เอาต์

ใช้ Durable Object (SQLite) บน Workers Free plan หนึ่ง object ต่อเว็บไซต์ ไม่ใช้ Workers KV เพราะแพลนฟรีเขียน KV ได้ 1,000 ครั้งต่อวัน ซึ่งไม่พอสำหรับตัวนับ

## สิ่งที่นับ

| ค่า | ความหมาย |
| --- | --- |
| `today` | ผู้เข้าชมไม่ซ้ำในวันปฏิทินเขตเวลา Asia/Bangkok (เปลี่ยนวันตอนเที่ยงคืน ตามเวลาไทย) |
| `total` | ผลรวมของผู้เข้าชมไม่ซ้ำรายวัน คนเดิมที่กลับมาวันใหม่นับเพิ่มในยอดรวมอีก 1 |

เก็บเฉพาะแฮช SHA-256 ไม่เก็บ IP, User-Agent หรือรหัสผู้เข้าชมแบบอ่านได้

## การตัดผู้เข้าชมซ้ำ

แต่ละคำขอสร้างแฮชอย่างมาก 2 ค่า แล้วเก็บในตาราง `seen` ของวันนั้น

1. ถ้าเบราว์เซอร์ส่งรหัสสุ่มจาก `localStorage` (`amt_visitor_id`, UUID v4) จะแฮช `vid:` + รหัสนั้น คนเดิมเบราว์เซอร์เดิมจึงนับครั้งเดียวในวันนั้น แม้ IP จะเปลี่ยน
2. แฮช `ipua:` จาก `CF-Connecting-IP` กับ `User-Agent` ใช้เมื่อไม่มีรหัส หรือเมื่อล้าง `localStorage` แล้ว IP กับเบราว์เซอร์ยังเดิม
3. ถ้าแฮชใดแฮชหนึ่งของวันนั้นมีอยู่แล้ว จะไม่เพิ่ม `today` และ `total` ถ้าเป็นคนใหม่ จะบันทึกทุกแฮชของคำขอนั้นไว้ด้วย เพื่อให้สองช่องทางนี้ผูกกัน
4. แฮชที่เก่ากว่า 2 วันถูกลบ ตารางรายวันกับยอดรวมยังอยู่

ถ้ารัน `npx wrangler secret put HASH_PEPPER` ก่อนมีผู้เข้าชมคนแรก แฮชของ IP จะเดาย้อนกลับได้ยากขึ้น ถ้าไม่ตั้งค่านี้ Worker ยังทำงาน และยังไม่เก็บข้อมูลส่วนบุคคลแบบอ่านได้

## เว็บไซต์ที่ใช้ร่วมกัน

CORS อนุญาตเฉพาะ

- `https://samnakngan-amtaudit.com` → คีย์ `amtaudit`
- `https://samnakngan-amtsolution.com` → คีย์ `amtsolution`

คีย์มาจากหัว `Origin` เท่านั้น ไคลเอนต์เลือกคีย์เองไม่ได้ origin อื่นได้ 403 และไม่มีหัว CORS เว็บ amtsolution ใช้ Worker ตัวเดียวกันได้ โดยใส่สคริปต์ตัวนับชุดเดียวกันแล้วชี้มาที่ URL เดียวกัน

`POST /v1/visit` รับ JSON `{ "vid": "<uuid>" }` แล้วตอบ `{ "site", "day", "today", "total" }` `GET /health` ตอบ `{ "ok": true }` โดยไม่เพิ่มตัวเลข

## ขีดจำกัดแพลนฟรี

อ้างอิง [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (Workers Free ไม่คิดเงิน ถ้าเกินโควตาคำขอประเภทนั้นจะล้ม ไม่ตัดบัตร)

| รายการ | โควตาฟรี |
| --- | --- |
| คำขอ Durable Object | 100,000 ครั้ง/วัน |
| ระยะเวลาประมวลผล | 13,000 GB-s/วัน |
| แถวที่เขียนใน SQLite | 100,000 แถว/วัน |
| ข้อมูลที่เก็บ | 5 GB รวมทั้งบัญชี |

โควตาวันรีเซ็ต 00:00 UTC เว็บสำนักงานทั่วไปอยู่ต่ำกว่านี้มาก

## ทดสอบบนเครื่อง

```bash
cd counter-worker
npm ci
npm test
npx wrangler dev
```

ในอีกเทอร์มินัล (พอร์ตเริ่มต้น 8787)

```bash
curl -sS http://127.0.0.1:8787/health
curl -sS -D- -o /tmp/visit.json -X POST http://127.0.0.1:8787/v1/visit \
  -H 'Origin: https://samnakngan-amtaudit.com' \
  -H 'Content-Type: application/json' \
  -H 'CF-Connecting-IP: 203.0.113.10' \
  -H 'User-Agent: smoke' \
  --data '{"vid":"550e8400-e29b-41d4-a716-446655440000"}'
```

ครั้งแรกได้ `today: 1` ยิงซ้ำด้วยรหัสเดิมหรือ IP+UA เดิมต้องได้ `today` เท่าเดิม origin อื่นต้องได้ 403

## ขั้นตอน deploy (ยังไม่ทำใน PR นี้)

ทำเมื่อพร้อมให้ตัวนับเริ่มเก็บของจริงเท่านั้น `wrangler deploy` และ `wrangler secret put` จะขึ้นเวอร์ชันบน Cloudflare ทันที

1. ใช้บัญชี Cloudflare ที่มีโซน DNS ของโดเมนนี้อยู่แล้ว และมี Node.js 20 ขึ้นไป
2. สร้าง API token แบบกำหนดสิทธิ์เอง (Create Custom Token) สิทธิ์อย่างน้อย Account / Workers Scripts / Edit และ Account / Workers Durable Objects / Edit หรือล็อกอินแทนด้วย `npx wrangler login` (OAuth ไม่ได้แยกสิทธิ์รายรายการ)
3. อย่าใส่ token ในแชทหรือในไฟล์ที่ commit ตั้งในเชลล์ครั้งเดียว เช่น `export CLOUDFLARE_API_TOKEN=...` แล้วปล่อยให้คำสั่งอ่านจากตัวแปรสภาพแวดล้อม
4. เข้าโฟลเดอร์แล้วติดตั้งของที่ล็อกไว้

```bash
cd counter-worker
npm ci
```

5. (แนะนำ) สร้าง pepper แล้วเก็บเป็น secret ก่อนมีทราฟฟิกจริง secret นี้ไม่เข้า git

```bash
openssl rand -base64 32
npx wrangler secret put HASH_PEPPER
```

วางค่าที่สุ่มได้เมื่อคำสั่งถาม อย่าส่งค่านี้เข้าอาร์กิวเมนต์ของคำสั่ง

6. Deploy Worker (ยังไม่ต้องแก้เว็บ)

```bash
npx wrangler deploy
```

จด URL ที่คำสั่งพิมพ์ เช่น `https://amt-visitor-counter.<subdomain>.workers.dev` ตรวจสุขภาพ

```bash
curl -sS https://amt-visitor-counter.<subdomain>.workers.dev/health
```

ต้องได้ `{"ok":true}` ไม่ต้องผูกโดเมนเองก็ได้ เบราว์เซอร์เรียกจาก `samnakngan-amtaudit.com` ข้ามโดเมนได้ เพราะ CORS เปิดไว้แล้ว

7. เปิดตัวนับบนเว็บ โดยแก้ไฟล์เดียว `assets/visitor-counter.js` เปลี่ยนบรรทัดนี้

```javascript
var AMT_VISITOR_COUNTER_ENDPOINT = "AMT_VISITOR_COUNTER_ENDPOINT_PLACEHOLDER";
```

เป็น origin จริง ไม่ใส่ path ท้าย เช่น

```javascript
var AMT_VISITOR_COUNTER_ENDPOINT = "https://amt-visitor-counter.<subdomain>.workers.dev";
```

8. Commit เฉพาะการเปลี่ยนค่า endpoint แล้ว push ขึ้น `main` ตามวิธีที่เว็บ GitHub Pages ใช้อยู่ หน้าเว็บจะโชว์บรรทัด `ผู้เข้าชมวันนี้ … คน · ผู้เข้าชมทั้งหมด … คน` เมื่อ Worker ตอบสำเร็จ ถ้า URL ยังเป็น placeholder หรือเรียกไม่ติด บรรทัดนี้ถูกซ่อนไว้ ไม่ดันเลย์เอาต์ และไม่โชว์ข้อความผิดพลาด

9. เว็บ `samnakngan-amtsolution.com` ยังไม่อยู่ในรีโปนี้ ถ้าจะใช้ตัวนับเดียวกัน ให้คัดลอกแท็ก `<p id="amt-visitor-counter" hidden></p>` ไปที่ฟุตเตอร์ และโหลดสคริปต์ `/assets/visitor-counter.js` (หรือก็อปไฟล์ไปวาง) โดยใช้ endpoint URL เดียวกัน Worker แยกยอดตาม origin ให้อยู่แล้ว

ถอดออกภายหลัง: ตั้ง endpoint กลับเป็น placeholder แล้ว `npx wrangler delete` ถ้าไม่ต้องการ Worker ต่อ

เว็บนี้ไม่มีเทมเพลตกลาง หน้าใหม่ต้องวางสไนปเป็ต gtag และแท็กตัวนับเอง ดูหน้าที่มีอยู่เป็นตัวอย่าง
