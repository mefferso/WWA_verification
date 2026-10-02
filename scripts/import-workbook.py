"""One-time local import. The workbook/token never enter the repository.

Usage: python scripts/import-workbook.py /path/to/export.xlsx
Requires openpyxl only for migration; Actions/runtime use Node built-ins.
Existing event files are never silently overwritten by a workbook import.
"""
import sys,json,gzip,hashlib,pathlib,datetime,collections
import openpyxl
root=pathlib.Path(__file__).resolve().parents[1]
workbook=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)
def clean(v):
    if isinstance(v,(datetime.date,datetime.datetime)):return v.isoformat()+('Z' if isinstance(v,datetime.datetime) and v.tzinfo is None else '')
    return v
def rows(name):
    return [[clean(v) for v in r] for r in workbook[name].iter_rows(values_only=True) if any(v is not None for v in r)]
def objects(name):
    r=rows(name)
    return [dict(zip(r[0],x)) for x in r[1:]] if r else []
def dump(file,value):
    file.parent.mkdir(parents=True,exist_ok=True)
    if str(file).endswith('.gz'):file.write_bytes(gzip.compress(json.dumps(value,separators=(',',':'),allow_nan=False).encode(),compresslevel=9,mtime=0))
    else:file.write_text(json.dumps(value,indent=2,allow_nan=False)+'\n')
config={str(r[0]).strip():r[1] for r in rows('Config')[1:]}
settings={'cwa':str(config.get('CWA','LIX')).strip().upper(),'qcChecks':str(config.get('QC checks','synopticlabs')),
    'qcRemove':str(config.get('QC remove flagged (on/off)','on')).lower(),'vars':str(config.get('Vars','')),
    'units':str(config.get('Units','english,speed|mph,temp|f')),'rfwWindBasis':str(config.get('RFW wind basis','sustained')),
    'durationMaxGapMinutes':float(config.get('Duration max gap minutes',30)),
    'minimumCoveragePct':float(config.get('Minimum coverage for nonverify %',50)),
    'tierAMnetIds':str(config.get('Tier A MNET IDs','')).replace(';',',').split(',') if config.get('Tier A MNET IDs') else [],
    'tierBMnetIds':str(config.get('Tier B MNET IDs','')).replace(';',',').split(',') if config.get('Tier B MNET IDs') else []}
# Explicit allowlist; no unknown Config values, secret rows, or logs copied.
dump(root/'config/settings.json',settings)
dump(root/'config/thresholds.json',rows('Thresholds')[1:])
dump(root/'config/zone-overrides.json',rows('ZoneOverrides')[1:] if rows('ZoneOverrides') else [])
station_rows=rows('Stations');dump(root/'data/stations.json.gz',station_rows)
dump(root/'data/legacy-minima.json.gz',rows('_Minima'))
grouped_areas=collections.defaultdict(list)
for a in objects('EventAreas'):
    grouped_areas[a['EVENT_KEY']].append({'ugc':a['UGC'],'startUtc':a['START_UTC'],'endUtc':a['END_UTC'],'action':a.get('ACTION') or '',
        'geometry':None,'source':a.get('SOURCE') or 'Imported event-area table'})
grouped_obs=collections.defaultdict(list)
for o in objects('_EventObs'):
    if o.get('EVENT_KEY') and o.get('STID'):grouped_obs[o['EVENT_KEY']].append(o)
sample_rows=rows('_ObsSamples');grouped_samples=collections.defaultdict(list)
for r in sample_rows[1:]:
    # Excel exports TRUE/FALSE cells as booleans. Preserve their meaning in the
    # string flags expected by the existing timeline UI and native Node runner.
    for i in range(11,len(r)):
        if isinstance(r[i],bool):r[i]='TRUE' if r[i] else 'FALSE'
    grouped_samples[r[0]].append(r)
events=objects('Events');imported_keys=set();counts={}
for e in events:
    key=e['EVENT_KEY'];imported_keys.add(key)
    areas=grouped_areas[key]
    if not areas:
        for ugc in str(e.get('WARNED_UGCS') or '').split(','):
            if ugc:areas.append({'ugc':ugc,'startUtc':e['ISSUE_UTC'],'endUtc':e['EXPIRE_UTC'],'action':'','geometry':None,'source':'Imported WARNED_UGCS + event-wide timing fallback'})
    has_obs=bool(grouped_obs[key]);note='Imported native observations; provider completeness not independently validated.' if has_obs else 'Imported event metadata only; observation history is missing and requires a verification job.'
    event={'eventKey':key,'eventId':str(e['EVENT_ID']),'year':int(e['EVENT_YEAR']),'wfo':e['WFO'],'hazard':e['HAZARD'],
        'phenomena':e['PHENOMENA'],'significance':e['SIGNIFICANCE'],'productLabel':e['PRODUCT_LABEL'],'issueUtc':e['ISSUE_UTC'],'expireUtc':e['EXPIRE_UTC'],
        'warnedUgcs':e.get('WARNED_UGCS') or ','.join(sorted(set(a['ugc'] for a in areas))),
        'footprintSource':e.get('FOOTPRINT_SOURCE') or 'Imported metadata','areaTimingMode':e.get('AREA_TIMING_MODE') or 'event-wide timing fallback',
        'dataComplete':False,'runNote':note,'imported':True,'importedHadObservations':has_obs}
    record={'schemaVersion':1,'event':event,'areas':areas,'summaries':grouped_obs[key],'sampleHeaders':sample_rows[0],
        'samples':grouped_samples[key],'cacheFingerprint':None,'provenance':{'source':'uploaded workbook export','importedUtc':'2026-10-02T16:12:58Z','providerCompletenessValidated':False}}
    file=root/'data/events'/(hashlib.sha256(key.encode()).hexdigest()[:24]+'.json.gz')
    if file.exists():raise RuntimeError('Event exists: import requires an empty target event directory; refusing to overwrite history')
    dump(file,record);counts[key]={'summaries':len(record['summaries']),'samples':len(record['samples']),'areas':len(areas)}
orphan=set(grouped_obs)|set(grouped_samples)|set(grouped_areas)
assert not orphan-imported_keys,'Orphan raw event keys require explicit reconciliation'
report={'source':'Cold_Hot_verification(1).xlsx; supplied export, not a live connection','events':len(events),
    'stationRows':len(station_rows)-1,'summaryRows':sum(x['summaries'] for x in counts.values()),'sampleRows':sum(x['samples'] for x in counts.values()),
    'thresholdRows':len(rows('Thresholds'))-1,'legacyMinimaRows':len(rows('_Minima'))-1,'perEvent':counts,
    'derivedTables':'Results and AreaVerification regenerated by Node; original inconsistent derived tables not used','logs':'Excluded to avoid credential-bearing provider errors'}
dump(root/'data/import-report.json',report)
print(json.dumps({k:v for k,v in report.items() if k not in ['perEvent']}))
