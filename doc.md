Quran Quiz: Bug Bounty + Hunter System
Poora project document | Aakhri update: 30 Sep 2026

1. Ham kya bana rahe hain
Quran Ayat Quiz ek web app hai (Vercel par hosted) jisme do khas features hain:

Ayat Quiz: ayat dikhti hai, user surah / para / page-in-para (pip) batata hai.
Search: poore Quran mein search (ayat ke text se, surah naam se, page/para se).
Iske saath multiplayer (Firebase Realtime DB), streak, hint, tasbih bar, SEO files pehle se hain.

Naya jo bana rahe hain: Bug Bounty system. Users app mein galti dhoondhte hain. Sahi (valid, unique) bug par max ₹100 inaam milta hai. Is system ke 3 hisse hain:

Hissa	Kaam
User side	Apply, rules padhna, exam, hunter dashboard, report karna, apni history dekhna
Admin side	Hunters approve/block, reports ka verdict, amount, payment track
Firebase rules	Data ki suraksha (kaun padh/likh sakta hai)
2. Kyu bana rahe hain
Manual testing ke liye time nahi hai. Users ko hi tester bana dena hai.
Quiz ka script data se compare karta hai, to quiz mein galti ka darr kam hai. Search mein galtiyan hone ki zyada sambhavna hai, isliye wahan users se test karwana hai.
Marketing: log app download karke, use karke, dusron ko batayenge.
Inaam tabhi milta hai jab bug valid aur unique ho, isliye kharcha control mein rehta hai.
3. Final features (poora plan)
User side

Menu mein "🐞 Bug Bounty" button
Apply → rules padho (+ .txt download) → "padh liye" tick → exam (8 sawalon ke pool se 5 random, 3 sahi = pass) → details form (naam, WhatsApp, UPI)
Admin approval ke baad hi Hunter mode ON
Hunter mode mein search aur quiz par 🐞 "Report karo" button
Form mein search/quiz ka data auto-attach aur read-only; user sirf sahi surah:ayat, para, pip, optional raay bharta hai
Dashboard: status, timeline, stats (Reports/Valid/Mila/Baaki), Hunter mode switch, "Aaj: x/5"
Meri reports: har report ka status (Review mein / Valid ₹X / Paid / Duplicate / Reject) + Report ID copy
Cache: khulte hi sahi status dikhe, "Apply" ka flash na aaye
Admin side (Google login, sirf admin Gmail)

Hunters: approve / block / reset (dobara apply)
Reports: auto-hint (asli Quran data se check), duplicate group (fingerprint), amount, Valid / Duplicate / Reject, Paid mark
Toast messages, in-page confirm modal, "rules purane" banner
Export: text copy + JSON download
Suraksha

Firebase Anonymous Auth (har browser ko asli uid), admin ke liye Google login
Rules: create-only, uid se bandha hua, admin-only padhna, field validation
4. Tech stack
HTML / CSS / JavaScript (plain, framework nahi), Firebase (Realtime Database + Auth), Vercel, GitHub. Develop: Android/Termux + laptop.

5. Files structure aur kis file mein kya
Quran-main/
├── index.html          # main app; bounty ke liye sirf 1 button + css/script links
├── style.css           # main app ki styling
├── script.js           # quiz + search logic (normalization, surah matching)
├── multiplayer.js      # online multiplayer (Firebase, rooms/)
├── quran_full.json     # poora Quran data (6236 ayat; text, surah, page, para, pip)
├── bounty.js           # (NAYA) user side: apply, rules, exam, form, dashboard, history, report
├── bounty.css          # (NAYA) bounty ki styling
├── admin.html          # (NAYA) admin page (Google login), akeli file
├── firebase-rules.json # (NAYA) Firebase rules, Console mein paste karni hain
├── logo.png, robots.txt, sitemap.xml, thankyou.html, googleXXXX.html, README.md
File	Kya milega
script.js	normalizeArabic (Urdu keyboard letters ka fix), SURAH_ALIASES, surahMatches (search), surahQuizOk (quiz ka surah check)
bounty.js	RULES (rules ka text), KNOWN (jo bug nahi), POOL (exam sawal), syncStatus, refreshHome (dashboard), renderHistory, openReport, submitReport, registerHunter
admin.html	Login, Hunters tab, Reports tab, Export tab, toast, modal, hint logic
firebase-rules.json	Saare access rules
6. Firebase structure
Node	Kaun likhta	Kaun padhta
rooms/	multiplayer (khula)	sab
bounty/hunters/{whatsapp}	hunter (ek baar, apne uid se)	sirf admin
bounty/byUid/{uid}	hunter (ek baar)	wo khud
bounty/status/{uid} (approved / blocked)	sirf admin	admin + wo khud
bounty/reports/{id}	approved hunter (ek baar, apne uid se)	sirf admin
bounty/mine/{uid}/{id}	approved hunter (report ki entry)	wo khud
bounty/pub/{uid}/{id} (verdict ki copy)	sirf admin	wo khud
bounty/admin/verdicts/{id}	sirf admin	sirf admin
Key baat: WhatsApp number hi hunter ki key hai, isliye ek number se sirf ek hunter ban sakta hai.

7. Bounty ke rules (business rules)
Inaam sirf Ayat Quiz aur Search par
Valid aur unique bug par pakka inaam, max ₹100; baaki chhote bugs par bhi chhota inaam (amount admin tay karta hai)
Sirf Para aur pip count hote hain; page ka claim nahi chalta
Search Rasm-e-Uthmani ke hisaab se; doosri spelling bug nahi
Reference mushaf: 609 safahat, har para 20 safah (para 2 safah 21 se, para 30 safah 585 se, 25 safah)
Duplicate: pehli report ko inaam (server time); ek wajah = ek bug
Limit: din mein 5 reports; 3 reject par block ho sakta hai; mahine ki total limit (abhi code mein nahi)
Payment: valid hone par admin UPI se manually deta hai
Jo bug nahi maane jayenge (known issues): Uthmani se alag spelling (الرحمان, ابراهيم, اسماعيل, صلاة, الكتاب), page ka claim, jo features hain hi nahi (pip/surah number se search, Urdu mein surah naam, translation search), surah ki rare English spelling
8. Flows
User: Menu → Bug Bounty → Apply → Rules → Exam (3/5) → Details → Pending → (admin approve) → Active → 🐞 se report → Meri reports mein status

Admin: admin.html → Google login → Hunters (Approve/Block/Reset) → Reports (hint dekho, amount daalo, Valid/Duplicate/Reject) → Paid mark → Export

9. Abhi tak kya bana hai (status)
Kaam	Status
Data audit (quran_full.json: 6236 ayat, sab surah ke count sahi, page/para/pip consistent)	✅
Search + quiz bug fixes (neeche section 10)	✅
Bounty user flow (apply, rules, exam, form, report)	✅
Firebase Anonymous Auth + rules (uid se bandha)	✅
Admin page (Google login, approve/block/reset, verdict, paid, export)	✅
Phase 1: user dashboard + history + cache + "Meri reports"	✅
Admin toasts + in-page modal + rules-check banner	✅
PERMISSION_DENIED (admin approve par)	✅ hat gaya
Phase 2: exam aur rules ka design	⏳ baaki
Phase 3: admin ka UX	⏳ baaki
10. Bugs aur errors
Mile aur fix ho gaye
#	Bug	Fix
1	Urdu keyboard (ک ی ہ ۃ ں ے) se search 0 result	normalizeArabic mein mapping jodi (sirf query ki taraf; Arabic text pe koi asar nahi, 6236 ayat mein 0 badlav)
2	Urdu/Arabic digits (۵) se page/para search nahi	Digits normalize
3	Search mein "baqarah", "yasin", "ikhlas" = 0 result	Letters-only match + SURAH_ALIASES
4	Quiz mein surah ke liye "a" ya "al" likhne se bhi sahi	surahQuizOk: poora naam ya shuru ke 4+ letters
5	Quiz mein "baqarah" galat maana jata tha	Spelling variants ab sahi
6	Rules mein root ".read": true hone se bounty data sabko dikhta (meri galti, pehle jodne ko kaha tha)	Poore naye rules, root band
7	hunterId localStorage se nakli ho sakta tha	Anonymous Auth uid, rules mein bandha
8	Ek WhatsApp se kai hunter	WhatsApp hi key, create-only
9	Search report mein sirf pehle 300 results check	Ab poore
10	Bar-bar "Apply" dikhna (status sync se pehle)	Status cache + loading state + offline banner
11	Phone data clear hone par dobara apply karna padta	byUid se khud pehchan leta hai
12	Admin Reset ke baad user ko "pending" hi dikhta tha, dobara apply nahi kar pata	Server se registration check, Apply wapas
13	Purana hunter record (uid nahi) approve nahi ho sakta	Admin mein note + sirf Reset
14	Admin mein koi response nahi	Toast, loading button, error toast
15	Chrome ka native alert/confirm	In-page toast + modal (admin aur bounty mein)
Abhi bhi maujood (jaan-boojh kar ya baaki)
#	Masla	Note
1	Uthmani se alag spelling ki search (الرحمان, الكتاب…) 0 result	Tumhare rule ke hisaab se bug nahi. Chaho to optional-alef matching jod sakte hain (loose hai)
2	"5 reports/din" sirf app mein, server par nahi	Bachav: approval + block + admin review
3	Exam browser mein chalta hai (jawab code mein dikh sakte hain)	Gate hai, security nahi; asli gate admin approval
4	Duplicate auto-reject nahi; admin page par "duplicate?" tag aata hai	Final faisla admin ka
5	Mushaf ka naam rules mein khali ([MUSHAF KA NAAM YAHAN LIKHEIN])	Tumhe bharna hai (para 2 → safah 21, para 30 → 585, aakhri 609 se milao)
6	Mahine ki total limit (cap) abhi code mein nahi	Sirf rules ke text mein
7	script.js ("Quran data load error") aur multiplayer.js ("Room band ho gaya") mein abhi bhi Chrome popup	Toast banana baaki
8	rooms/ ke rules khule hain (pehle jaise)	Multiplayer ke liye; alag se sakht kiye ja sakte hain
9	Pehle ke test reports "Meri reports" mein nahi dikhengi	Unki index entry nahi bani thi
10	Asli Firebase par poori testing nahi hui (maine simulated browser mein test kiya)	Phone par end-to-end dekhna hai
11	"Known issues" ki alag in-app screen nahi; sirf rules ke text mein	Phase 2 mein ban sakti hai
11. Kya fix/update karna baaki hai (UI/UX)
Phase 2: exam aur rules ka design (same green palette, alag shades)

Exam: progress bar, ek-ek sawal ka card, option tap animations, result screen (kaunse sawal galat hue aur kyun), retry
Rules: chhote sections (icons ke saath), expand/collapse, "❌ Ye bug nahi hain" alag card, chhoti animations
"Known issues" ko app ke andar dikhana
Phase 3: admin UX

Filters (Pending / Valid / Duplicate / Reject) aur search, counts
Payment list: har UPI ka total ek jagah, ek tap mein copy
Hunter ki poori report history ek jagah
Undo (galti se dabne par)
Mahine ka cap aur summary
Aage ke marketing ideas (abhi plan mein nahi)

Share card / WhatsApp invite, leaderboard, daily challenge
12. Deploy checklist (Firebase + Vercel)
Firebase Console → Authentication → Sign-in method: Anonymous ON aur Google ON
Authorized domains mein quran-quiz-eta.vercel.app jodo
Realtime Database → Rules mein firebase-rules.json ka poora content paste karke Publish
Repo mein files replace karo: index.html, script.js, bounty.js, bounty.css, admin.html
Admin Gmail par 2-step verification ON rakho
Phone par end-to-end test: apply → exam → admin approve → report → admin Valid → user ko status dikhe
Rules ke point 4 mein mushaf ka naam bharo
13. Fayle jo chat mein diye gaye (output)
script.js (search/quiz fixes), index.html, bounty.js, bounty.css, admin.html, firebase-rules.json

14. Mahatvapurn faisle (decision log)
Faisla	Kisne
Inaam: valid unique bug par max ₹100; chance-based (30%) system hata diya	Najeef
Sirf para aur pip count; search Rasm-e-Uthmani se	Najeef
Exam: MCQ, 3/5 pass, random sawal	Najeef
Form alag file mein; index.html mein sirf button	Najeef
Admin alag admin.html, Google login	Najeef
Asli gate = admin approval (exam security nahi)	Claude ka suggestion, Najeef ne liya
Phase plan: 1 user dashboard → 2 exam/rules design → 3 admin UX	Claude ka suggestion, Najeef ne liya
15. Agla kadam
Rules publish + end-to-end test (upar checklist)
Phase 2 (exam + rules design)
Phase 3 (admin UX)
