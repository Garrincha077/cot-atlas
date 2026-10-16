# COT Atlas v0.5 — Contract Roll Lab

[Contract Roll Lab online](https://cot-atlas-git.vercel.app/roll-lab.html)

## Zašto odvojena stranica

COT izvještaji ne sadrže settlement cijene futures dospijeća. Besplatni "continuous futures" prikazi mogu pri prelasku ugovora pomiješati različite cijene te naivni backtest može knjižiti nepostojeći profit ili gubitak.

Ova stranica u pregledniku koristi isključivo **korisnikov CSV settlementa svakog pojedinačnog futures ugovora** i ne dohvaća automatski neprovjerene cijene. Podaci se ne šalju našem serveru i po zatvaranju stranice nestaju iz memorije.

## CSV shema

```csv
date,root,contract,expiry,settle,multiplier,tick_size,volume
```

- `date`: ISO datum settlementa `YYYY-MM-DD`.
- `root`: jedinstven simbol temeljnog tržišta za cijeli CSV, npr. `GC`.
- `contract`: stvarno ugovorno dospijeće, npr. `GCZ26` (simbol je samo identifikator i aplikacija ne tvrdi da je dospijeće validirano kod burze).
- `expiry`: **posljednji dan trgovanja** baš tog futures ugovora, ne delivery date.
- `settle`: settlement cijena na taj dan. Negativne cijene dopuštene su radi povijesnih događaja poput WTI 2020.
- `multiplier`: nominalni multiplikator ugovora (dijelovi/pokazatelji prema burzovnoj specifikaciji), >0 i isti za sve redove.
- `tick_size`: najmanji korak cijene iz burzovne specifikacije, >0 i isti za sve redove.
- `volume`: neobavezan dnevni volumen po ugovoru; obavezan ako želiš koristiti volume crossover pravilo.

CSV mora imati najmanje tri različita dana; svaka kombinacija contract+date smije se pojaviti samo jednom. Učitavanje prihvaća samo jedan `root`, jednu veličinu ugovora i jedan tick po datoteci. Nedostajuća cijena držanog ugovora izaziva **grešku**, ne forward-fill. Potpuni izostanak cijelog tržišnog dana ne može se otkriti bez kalendara burze: pregledaj upozorenja i izvorni eksport.

## Pravila i obračun

- Fiksni roll: kupi najbliži raspoloživi ugovor s više od `rollDays` kalendarskih dana do zadnjeg dana trgovanja; ako je držani ugovor dosegnuo granicu, na njegovu settlementu ga zatvori i na settlementu sljedećeg eligible ugovora otvori novi.
- Volume-2: dopušta raniji prelazak samo kada volumen sljedećeg ugovora nadmašuje prethodni volumen **dva uzastopna dostupna dana**. Prisilni prelazak i dalje nastaje pri granici `rollDays`.
- Dnevni bruto P&L: `direction × contracts × (settle_today_of_HELD_contract - settle_previous_of_SAME_contract) × multiplier`.
- Na dan rolla ne dodaje se razlika između settlementa starog i novog ugovora. Obrada traje po starom ugovoru do trenutka prijelaza.
- Provizija po strani u USD i slippage po strani izražen u tickovima; za svaki roll 2 strane, ulaz/izlaz po 1. Total P&L iskazan je u USD, **ne u % na margin ili na kapital**.
- JSON audit sadrži ulaz, izlaz, sve rollove, troškove, hipotetsku dnevnu krivulju i lokalno izračunati SHA-256 sadržaja CSV datoteke.

## Ograničenja

**Ovo nije potvrđen PIT COT backtest niti dokaz stvarno ostvarivog futures prinosa.** Ne verificira licencu, autentičnost dobavljača CSV-a, correctness `expiry`/multiplier/tick, stvarne bid/ask cijene ni raspoloživost naloga na settlementu. Nema nettinga, kolaterala, marže, poreza, financiranja ni troška vlastitog kapitala. Nema korektne kapitalne stope prinosa bez početnog i tekućeg kolaterala. Volumen/roll pravila su simulacijska, bez osiguranog burzovnog kalendara. Ne koristimo automatizirano preuzimanje cijena sa stranica koje nemaju pravo redistribucije.

**Stari Research Lab v0.4 ostaje** s Yahoo continuous-futures istraživačkim prikazom, koji **još nije** povezan s ugovornom P&L mašinom. COT Atlas v0.5 dodaje temelj za budući auditable per-trade replay.

## Podrijetlo podataka

- CFTC: [Historical Compressed COT archive](https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm)
- CME: [Daily Settlements](https://www.cmegroup.com/market-data/daily-settlements.html)
- CME: [Settlement data access and licensing FAQ](https://www.cmegroup.com/articles/faqs/access-to-cme-group-settlement-data-faq.html)

Testovi: `node --test tests/test_contract_roll.mjs`. CI: `.github/workflows/research-ci.yml`.
