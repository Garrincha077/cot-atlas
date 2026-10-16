/* CFTC observed/scheduled COT release dates (report-date -> publication date).
 * Official sources: cftc.gov/PressRoom/PressReleases/9147-25 and
 * cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm
 * Calendar does not certify original published VALUE vintages.
 */
(function(root){"use strict";
const MS=86400000;
const shift=(d,n)=>new Date(Date.parse(d+"T00:00:00Z")+n*MS).toISOString().slice(0,10);
const known={
 "2025-01-07":"2025-01-13",
 "2025-09-30":"2025-11-19","2025-10-07":"2025-11-21",
 "2025-10-14":"2025-11-25","2025-10-21":"2025-12-02",
 "2025-10-28":"2025-12-05","2025-11-04":"2025-12-09",
 "2025-11-10":"2025-12-10","2025-11-18":"2025-12-12",
 "2025-11-25":"2025-12-15","2025-12-02":"2025-12-17",
 "2025-12-09":"2025-12-19","2025-12-16":"2025-12-23",
 "2025-12-23":"2025-12-29","2025-12-30":"2026-01-05"
};
// 2026 CFTC tentative release schedule (usually Friday, sometimes Monday).
// Each maps to preceding Tuesday, including 2025-12-30 -> 2026-01-05.
const releases2026=[
 "2026-01-05","2026-01-09","2026-01-16","2026-01-23","2026-01-30",
 "2026-02-06","2026-02-13","2026-02-20","2026-02-27",
 "2026-03-06","2026-03-13","2026-03-20","2026-03-27",
 "2026-04-03","2026-04-10","2026-04-17","2026-04-24",
 "2026-05-01","2026-05-08","2026-05-15","2026-05-22","2026-05-29",
 "2026-06-05","2026-06-12","2026-06-22","2026-06-26",
 "2026-07-06","2026-07-10","2026-07-17","2026-07-24","2026-07-31",
 "2026-08-07","2026-08-14","2026-08-21","2026-08-28",
 "2026-09-04","2026-09-11","2026-09-18","2026-09-25",
 "2026-10-02","2026-10-09","2026-10-16","2026-10-23","2026-10-30",
 "2026-11-06","2026-11-16","2026-11-20","2026-11-30",
 "2026-12-04","2026-12-11","2026-12-18","2026-12-28"
];
const scheduled={};
for(const release of releases2026){
 const weekday=new Date(release+"T00:00:00Z").getUTCDay(),back=((weekday-2+7)%7)||7;
 const report=shift(release,-back);
 if(!known[report])scheduled[report]=release;
}
function lookup(reportDate){
 if(typeof reportDate!=="string"||!/^\d{4}-\d\d-\d\d$/.test(reportDate))return null;
 if(known[reportDate])return {reportDate,releaseDate:known[reportDate],source:"CFTC_OFFICIAL_SPECIAL_SCHEDULE",publicationTimeVerified:false};
 if(scheduled[reportDate])return {reportDate,releaseDate:scheduled[reportDate],source:"CFTC_OFFICIAL_TENTATIVE_2026",publicationTimeVerified:false};
 // Shutdown-week dates not explicitly mapped MUST NOT quietly fall back to Fridays.
 if(reportDate>="2025-09-30"&&reportDate<="2025-12-30")return null;
 if(reportDate>="2026-01-01"&&reportDate<="2027-01-01")return null;
 if(new Date(reportDate+"T00:00:00Z").getUTCDay()!==2)return null;
 return {reportDate,releaseDate:shift(reportDate,3),source:"UNVERIFIED_FRIDAY_PROXY",publicationTimeVerified:false};
}
root.COT_RELEASE_DATES={lookup,special:known,scheduled};
})(typeof window!=="undefined"?window:globalThis);
