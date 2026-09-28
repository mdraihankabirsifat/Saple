# Company seed sources

The reference-data section in `database/postgres/02_final_demo_data_postgres.sql` contains public employer reference data only. It does not derive salary, review, interview, verification, or user records from these external sources. Metadata was checked against the organizations' official pages on 2026-08-08. Headquarters is the global headquarters for international organizations and the principal Bangladesh office for Bangladesh-focused entries. Company-size values are broad discoverability buckets, not exact live headcounts.

| Company | Official source | Metadata supported |
|---|---|---|
| Grameenphone | https://www.grameenphone.com/about/discover-gp/about-grameenphone/company-profile | identity, sector, Bangladesh presence |
| Robi Axiata | https://www.robi.com.bd/en/corporate | identity, sector, Bangladesh presence |
| Banglalink | https://www.banglalink.net/en/about-us | identity, sector, Bangladesh presence |
| BRAC Bank | https://www.bracbank.com/en/about-us | identity, banking focus, location |
| City Bank | https://www.citybankplc.com/about-us | identity, banking services, location |
| Eastern Bank | https://www.ebl.com.bd/about/profile | identity, banking services, location |
| Dutch-Bangla Bank | https://www.dutchbanglabank.com/about-us/brief-history.html | identity, banking services, location |
| IDLC Finance | https://idlc.com/about-us | identity, financial services, location |
| bKash | https://www.bkash.com/en/about | identity, mobile financial services, location |
| Nagad | https://nagad.com.bd/about-us | identity, mobile financial services, location |
| Square Pharmaceuticals | https://squarepharma.com.bd/about-us.php | identity, pharmaceuticals, location |
| Renata | https://www.renata-limited.com/about-us | identity, pharmaceuticals, location |
| Incepta Pharmaceuticals | https://www.inceptapharma.com/our-growth.php | identity, pharmaceuticals, location |
| Beximco Pharmaceuticals | https://www.beximcopharma.com/about-us | identity, pharmaceuticals, location |
| ACI | https://www.aci-bd.com/about-us/company-profile.html | identity, business areas, location |
| PRAN-RFL Group | https://www.pranrflgroup.com/about-us | identity, business areas, location |
| Walton Hi-Tech Industries | https://waltonbd.com/about | identity, manufacturing focus, headquarters, workforce size bucket |
| Bashundhara Group | https://www.bashundharagroup.com/page/corporate-profile | identity, business areas, corporate office |
| Akij Group | https://akij.net/companyprofile/ | identity, business areas, corporate office |
| Meghna Group of Industries | https://www.mgi.org/about | identity, business areas, corporate office, workforce size bucket |
| Beximco Group | https://www.beximco.com/about | identity, business areas, location |
| DBL Group | https://dbl-group.com/about/about/ | identity, business areas, corporate office |
| Viyellatex Group | https://www.viyellatexgroup.com/about/ | identity, apparel focus, Bangladesh presence, workforce size bucket |
| Brain Station 23 | https://brainstation-23.com/about | identity, software focus, Dhaka office |
| BJIT | https://bjitgroup.com/about-us | identity, software focus, Bangladesh operation, workforce size bucket |
| Enosis Solutions | https://www.enosisbd.com/about-us | identity, software focus, Bangladesh operation |
| Therap (Bangladesh) | https://therapbd.com/about-us | identity, software focus, Bangladesh operation |
| SSL Wireless | https://sslwireless.com/about-us | identity, technology focus, Bangladesh presence, workforce size bucket |
| Pathao | https://pathao.com/about-us/ | identity, services, Bangladesh presence |
| Chaldal | https://chaldal.com | identity, online grocery services, Bangladesh presence |
| ShopUp | https://shopup.org/about | identity, B2B commerce focus, Dhaka office |
| Daraz Bangladesh | https://www.daraz.com.bd/wow/i/bd/about-us/index | identity, e-commerce focus, Bangladesh operation |
| foodpanda Bangladesh | https://www.foodpanda.com.bd/contents/about.htm | identity, delivery focus, Bangladesh operation |
| BRAC | https://www.brac.net/who-we-are | identity, development focus, Bangladesh origin |
| Summit Group | https://summitpowerinternational.com/about-us | identity, power and infrastructure focus, Bangladesh origin |
| Google | https://about.google/company-info/ | identity, business focus, global headquarters |
| Microsoft | https://news.microsoft.com/facts-about-microsoft/ | identity, business focus, global headquarters |
| Amazon | https://www.aboutamazon.com/about-us | identity, business focus, global headquarters |
| IBM | https://www.ibm.com/about | identity, business focus, global headquarters |
| Oracle | https://www.oracle.com/corporate/ | identity, business focus, global headquarters |
| Samsung Electronics | https://www.samsung.com/global/ir/company-information/ | identity, business focus, global headquarters |
| Unilever | https://www.unilever.com/our-company/at-a-glance/ | identity, business focus, global headquarters |
| Nestle | https://www.nestle.com/aboutus | identity, business focus, global headquarters |
| Siemens | https://www.siemens.com/global/en/company/about.html | identity, business focus, global headquarters |
| Deloitte | https://www.deloitte.com/global/en/about.html | identity, professional services focus |
| PwC | https://www.pwc.com/gx/en/about.html | identity, professional services focus |
| Maersk | https://www.maersk.com/about | identity, logistics focus, global headquarters |
| Toyota | https://global.toyota/en/company/profile/overview/ | identity, automotive focus, global headquarters |
| Pfizer | https://www.pfizer.com/about | identity, biopharmaceutical focus, global headquarters |
| HSBC | https://www.hsbc.com/who-we-are | identity, banking focus, global headquarters |


## Companies added by the optional bulk demo data

`database/postgres/04_bulk_demo_data_postgres.sql` adds the 59 companies below. Only their reference metadata (name, industry, headquarters city and country, website, a broad size bucket for very large employers, and a neutral one-line description) comes from these sources. Every salary, review, interview experience, job vacancy and application that the same file creates is synthetic academic demo data, and is neither sourced from nor attributed to these organisations.

Each official website below was confirmed to respond on 2026-09-29; some answer automated requests with HTTP 403, which still confirms the site. Five candidates whose official sites could not be confirmed from this environment were left out. Industry and headquarters follow each organisation's publicly stated corporate details.

| Company | Official source | Metadata supported |
|---|---|---|
| REVE Systems | https://www.revesoft.com | identity, software focus, Dhaka presence |
| DataSoft Systems Bangladesh | https://datasoft-bd.com | identity, software and IT services, Dhaka |
| Tiger IT Bangladesh | https://www.tigerit.com | identity, software focus, Dhaka |
| Cefalo Bangladesh | https://www.cefalo.com | identity, software engineering, Bangladesh office |
| Kaz Software | https://kaz.com.bd | identity, software development, Dhaka |
| SELISE Digital Platforms | https://selise.ch | identity, software focus, Zurich headquarters |
| Vivasoft | https://vivasoftltd.com | identity, software development, Dhaka |
| Dynamic Solution Innovators | https://www.dsinnovators.com | identity, software development, Dhaka |
| Southtech | https://www.southtechgroup.com | identity, software and enterprise solutions, Dhaka |
| Teletalk Bangladesh | https://www.teletalk.com.bd | identity, telecommunications, Dhaka |
| IFIC Bank | https://www.ificbank.com.bd | identity, banking, Dhaka |
| Mutual Trust Bank | https://www.mutualtrustbank.com | identity, banking, Dhaka |
| Prime Bank | https://www.primebank.com.bd | identity, banking, Dhaka |
| Bank Asia | https://www.bankasia-bd.com | identity, banking, Dhaka |
| Islami Bank Bangladesh | https://www.islamibankbd.com | identity, Shariah-based banking, Dhaka |
| Pubali Bank | https://www.pubalibangla.com | identity, banking, Dhaka |
| Eskayef Pharmaceuticals | https://www.skfbd.com | identity, pharmaceutical manufacturing, Dhaka |
| Healthcare Pharmaceuticals | https://www.hplbd.com | identity, pharmaceutical manufacturing, Dhaka |
| ACME Laboratories | https://www.acmeglobal.com | identity, pharmaceutical manufacturing, Dhaka |
| Marico Bangladesh | https://marico.com/bangladesh | identity, consumer goods, Bangladesh business |
| City Group | https://www.citygroup.com.bd | identity, consumer goods and food manufacturing, Dhaka |
| BSRM | https://www.bsrm.com | identity, steel manufacturing, Chattogram |
| Abul Khair Group | https://www.abulkhairgroup.com | identity, diversified industrial group, Chattogram |
| Rahimafrooz | https://www.rahimafrooz.com | identity, diversified group, Dhaka |
| Ha-Meem Group | https://www.hameemgroup.net | identity, apparel and textiles, Dhaka |
| Epyllion Group | https://www.epylliongroup.com | identity, apparel and textiles, Dhaka |
| Envoy Textiles | https://www.envoytextiles.com | identity, denim textile manufacturing, Dhaka |
| RedX | https://redx.com.bd | identity, delivery and logistics, Dhaka |
| Paperfly | https://paperfly.com.bd | identity, e-commerce logistics, Dhaka |
| Shohoz | https://www.shohoz.com | identity, ticketing and travel platform, Dhaka |
| LightCastle Partners | https://lightcastlepartners.com | identity, management consulting and research, Dhaka |
| icddr,b | https://www.icddrb.org | identity, health research, Dhaka |
| ASA | https://asa.org.bd | identity, microfinance, Dhaka |
| Meta | https://about.meta.com | identity, technology, Menlo Park headquarters |
| Apple | https://www.apple.com | identity, technology, Cupertino headquarters |
| SAP | https://www.sap.com | identity, enterprise software, Walldorf headquarters |
| Salesforce | https://www.salesforce.com | identity, enterprise software, San Francisco headquarters |
| Accenture | https://www.accenture.com | identity, professional services, Dublin headquarters |
| Infosys | https://www.infosys.com | identity, IT services, Bengaluru headquarters |
| Tata Consultancy Services | https://www.tcs.com | identity, IT services, Mumbai headquarters |
| NVIDIA | https://www.nvidia.com | identity, semiconductors, Santa Clara headquarters |
| Intel | https://www.intel.com | identity, semiconductors, Santa Clara headquarters |
| Cisco | https://www.cisco.com | identity, networking technology, San Jose headquarters |
| EY | https://www.ey.com | identity, professional services, London headquarters |
| KPMG | https://kpmg.com | identity, professional services, London headquarters |
| Boston Consulting Group | https://www.bcg.com | identity, management consulting, Boston headquarters |
| Standard Chartered | https://www.sc.com | identity, banking, London headquarters |
| Citi | https://www.citigroup.com | identity, banking, New York headquarters |
| JPMorgan Chase | https://www.jpmorganchase.com | identity, financial services, New York headquarters |
| Procter & Gamble | https://us.pg.com | identity, consumer goods, Cincinnati headquarters |
| The Coca-Cola Company | https://www.coca-colacompany.com | identity, beverages, Atlanta headquarters |
| PepsiCo | https://www.pepsico.com | identity, food and beverage, Purchase (New York) headquarters |
| Novartis | https://www.novartis.com | identity, pharmaceuticals, Basel headquarters |
| GSK | https://www.gsk.com | identity, pharmaceuticals, London headquarters |
| AstraZeneca | https://www.astrazeneca.com | identity, pharmaceuticals, Cambridge headquarters |
| BMW Group | https://www.bmwgroup.com | identity, automotive manufacturing, Munich headquarters |
| Volkswagen Group | https://www.volkswagen-group.com | identity, automotive manufacturing, Wolfsburg headquarters |
| Sony | https://www.sony.com | identity, electronics, Tokyo headquarters |
| LG Electronics | https://www.lg.com | identity, electronics manufacturing, Seoul headquarters |

These links are documentation references, not runtime dependencies. Future maintainers should recheck metadata before materially changing a record; exact employee counts and other volatile facts intentionally are not stored.
