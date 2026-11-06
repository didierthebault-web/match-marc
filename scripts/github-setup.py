"""Provision explicitly requested repository/Pages using Git's credential manager.
Credentials are retained only in process memory, never in arguments or files.
"""
import subprocess,os,json,urllib.request,urllib.error,sys,ssl
os.environ['GIT_TERMINAL_PROMPT']='0'
os.environ['GCM_INTERACTIVE']='never'
p=subprocess.run(['git','credential','fill'],input='protocol=https\nhost=github.com\n\n',text=True,capture_output=True)
if p.returncode:raise SystemExit('Authentification GitHub indisponible (aucun secret affiché).')
credential=dict(line.split('=',1) for line in p.stdout.splitlines() if '=' in line)
token=credential.get('password')
if not token:raise SystemExit('Aucun identifiant GitHub disponible.')
context=ssl.create_default_context()
bundle=os.path.expanduser('~/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/mingw64/etc/ssl/certs/ca-bundle.crt')
if os.path.exists(bundle):context.load_verify_locations(bundle)
if sys.platform=='win32':
    for store in ['ROOT','CA']:
        for cert,encoding,trust in ssl.enum_certificates(store):
            if encoding=='x509_asn':
                try:context.load_verify_locations(cadata=ssl.DER_cert_to_PEM_cert(cert))
                except ssl.SSLError:pass
def api(method,path,data=None):
    req=urllib.request.Request('https://api.github.com'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Match-MARC-Setup'},method=method)
    try:
        with urllib.request.urlopen(req,timeout=30,context=context) as r:return json.load(r) if r.status!=204 else {}
    except urllib.error.HTTPError as e:
        if e.code==404:return None
        raise RuntimeError('GitHub HTTP '+str(e.code)+': '+e.read().decode()[:300]) from None
repo='/repos/didierthebault-web/match-marc'
mode=sys.argv[1]
if mode=='create':
    if api('GET','/user')['login']!='didierthebault-web':raise SystemExit('Compte authentifié différent du compte demandé.')
    r=api('GET',repo)
    if r is not None:raise SystemExit('Le dépôt existe déjà : inspection nécessaire avant toute modification.')
    r=api('POST','/user/repos',{'name':'match-marc','description':'Comparaison locale de corpus UNIMARC PMB → Koha, validation humaine et exports de migration.','private':False,'auto_init':False})
    print(json.dumps({'url':r['html_url'],'private':r['private']}))
elif mode=='pages':
    r=api('GET',repo+'/pages')
    if r is None:r=api('POST',repo+'/pages',{'build_type':'legacy','source':{'branch':'main','path':'/'}})
    print(json.dumps({'url':r['html_url'],'status':r['status'],'build_type':r['build_type']}))
elif mode=='status':
    r=api('GET',repo+'/pages');b=api('GET',repo+'/pages/builds/latest')
    runs=api('GET',repo+'/actions/runs?per_page=3') or {}
    print(json.dumps({'pages':{k:r.get(k) for k in ['html_url','status','build_type']} if r else None,'build':{k:b.get(k) for k in ['status','error','duration','commit']} if b else None,'runs':[{k:a.get(k) for k in ['id','name','status','conclusion','html_url']} for a in runs.get('workflow_runs',[])]}))
