StayAtlas — Airbnb / Seattle theme for Azure Coursework 1 and Coursework 2
Prepared: 2026-10-19

START HERE
1. Install Node.js 22.13 or later.
2. Open a terminal in this folder and run:
   npm ci --no-audit --no-fund
   npm start
3. Open http://127.0.0.1:7074 in a browser. Keep the terminal running.
   Do not open web/index.html directly as a file: the CRUD API needs the server.
   Windows alternative: powershell -ExecutionPolicy Bypass -File scripts/Start-Local.ps1
4. The local app writes media to .local/assets.json and .local/blobs.
   The reference dataset in data/ is immutable. No database account is needed locally.

WHAT WORKS LOCALLY
- Browse 1,000 historic Seattle Airbnb listings with neighbourhood, room-type,
  guest-count, keyword, historical budget, ordering and 12-card pagination.
- Browser-local favourites. They are not cloud accounts and do not sync devices.
- Nested historical reviews: 13,130 real comments in total, retrieved per listing,
  with keyword/date filters and paging. No invented individual star ratings.
- Share, preview, download, edit metadata and delete JPEG, PNG and PDF media.
- Bind each new media entry to a known listing. The nested listing snapshot and
  file identity cannot be reassigned by a metadata update.
- 3 MiB binary cap, MIME/extension/signature inspection, dimensions and SHA-256.
  Header inspection is not full decoding or malware scanning.
- PDF.js renders the actual PDF and offers page controls. A file that cannot be
  rendered can still be downloaded.
- Optional shared write token for the cloud editorial group. This prototype has
  no personal ownership, user registration, booking, payments or live availability.
- Three original PDF guide examples are created in a fresh local space. They are
  generic educational worksheets, not claims about actual host services.

COURSEWORK STATUS
CW1: a 15-slide editable design plus the additional original checklist is supplied
separately at output/airbnb/StayAtlas_CW1_Design_Submission.pptx in the parent workspace.
CW2: the application is deployed to Azure. A live verification run on 2026-11-09
passed 15 checks, including PDF CRUD, download byte equality and live translation.
Website: https://stayatlasyxizclwt.z28.web.core.windows.net
Health: https://stayatlas-yxizclwt-api.azurewebsites.net/api/health
The GitHub / Azure DevOps build and the student-recorded walkthrough are separate
coursework evidence.

SOURCE / SCOPE
This is the Azure coursework interpretation of the second Airbnb topic.
The earlier Option_2_Airbnb_Plan.docx describes a separate COM661 Flask/MongoDB
plan. It is preserved and is not claimed to be implemented by this Azure project.
The Azure design makes the required multimedia sharing use case central. Historic
listing/review data provides context, while new shared media receives full CRUD.

Data: https://www.kaggle.com/datasets/airbnb/seattle
Snapshot date: 2016-01-04. Source: 3,818 listings and 84,849 reviews.
Development subset: first 1,000 valid listings with >=2 reviews, at most the first
20 distinct nonempty comments per listing. The original source verification and
archive hash are recorded in data/provenance.json. Reviewer IDs are removed from
the app. Free text can still contain names, so this is not fully anonymised data.
The first index is 219,532 bytes. Review text is split into 1,000 detail chunks.
The source images, exact addresses, calendars and reviewer profiles are omitted.
Interior stock photos are illustrative only. Credits: web/assets/credits.json.
Stock licence: https://unsplash.com/license. Do not present those photos as
photographs of the corresponding Airbnb properties.

COMMANDS
npm run check    JavaScript syntax checks
npm test         Local HTTP, binary CRUD, reference-data and mocked Azure contracts
npm run test:ci  JUnit results in reports/junit.xml
npm run build    Static frontend in dist/, including reference chunks and PDF.js
postman/StayAtlas.postman_collection.json
                Import into Postman for a sequenced local / cloud API demonstration.
                Its delete step removes only the test guide that the collection creates.
powershell -ExecutionPolicy Bypass -File scripts/Package.ps1
                Creates StayAtlas_CW2_Source.zip and StayAtlas_Function.zip in
                ../output/airbnb. Function package includes the reference dataset.

API
GET    /api/config, /api/health, /api/catalogue
GET    /api/listings?neighbourhood=West%20Queen%20Anne&guests=4&maxPrice=100
GET    /api/listings/241032
GET    /api/listings/241032/reviews?q=quiet&from=2011-01-01&page=1
GET    /api/assets?listingId=241032
POST   /api/assets                  create media (IUPS)
GET    /api/assets/{uuid}           read metadata (RIPS)
PUT    /api/assets/{uuid}           update allowed metadata (UIPS)
PATCH  /api/assets/{uuid}           same metadata update semantics
DELETE /api/assets/{uuid}           delete metadata and binary (DIPS)
GET    /api/assets/{uuid}/file       preview bytes (FIPS)
GET    /api/assets/{uuid}/file?download=1
POST   /api/analyze                 inspect a file in the HTTP Function
POST   /api/translate               real Azure Translator when configured
POST   /api/access                  validate X-Write-Token
All POST / PUT / PATCH bodies use application/json.
Create body: {title,listingId,creatorName,description,tags,language,rights,
 upload:{fileName,contentType,dataBase64}}.
Update body supports title, creatorName, description, tags, language and rights.
rights: original / permission / public-domain. language: zh-Hans / en / other.

AZURE PREPARATION
Read docs/Deployment.html and docs/Offline-Readiness.html before using scripts.
The default local configuration uses the local API. Cloud credentials and signed
workflow URLs are held outside this repository.
The gateway requires six WORKFLOW_{IUPS,RAI,RIPS,UIPS,DIPS,FIPS}_URL settings,
WRITE_TOKEN >=24 characters, exact ALLOWED_ORIGINS, AZURE_TRANSLATOR_KEY and REGION.
Secrets belong in Function settings / ignored .local/cloud, never in web/config.js.
All mutable cloud CRUD and file bytes use Logic Apps managed connectors. The
Function does not bypass those workflows by directly writing Blob or Cosmos.
The ARM template uses Cosmos DB for NoSQL, database stayatlas, container assets,
partition /id, a private Blob assets container and a Node 22 Flex Consumption
Function with on-demand instances. Workflow routes are generated from actual
connector Swagger after authorisation. The generator fails if an operation or
required input is absent.
See docs/CW2-Video.txt for the timed recording plan and evidence still to obtain.

LIMITS
- Read-only 2016 reference snapshot, not representative of today's Seattle market.
- Browser catalogue filtering downloads all reference metadata (not all reviews).
- RAI follows at most 20 workflow pages. Growth needs cursor paging/server search.
- Last-write-wins edits, shared editorial token, no individual owner permissions.
- Blob and Cosmos writes are not atomic. Create has best-effort rollback. Failed
  deletes can leave orphan blobs needing manual reconciliation.
- No malware scanning, content moderation service, current booking or payments.
- A new deployment depends on the subscription quota and regional availability.
- azure-pipelines.yml prepares GitHub-to-Azure-DevOps build tests and static output.
  The file's existence does not prove a successful real Pipeline run.

LOCAL VALIDATION
39 tests passed on the target Node.js 22.23.3 runtime on 2026-10-19.
Tests include actual loopback HTTP and file storage. Azure adapter/generator tests
use mock transport/synthetic Swagger and are explicitly not live Azure evidence.
