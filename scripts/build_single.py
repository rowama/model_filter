import re,os
R=os.path.join(os.path.dirname(__file__),'..');os.makedirs(f'{R}/dist',exist_ok=True)
h=open(f'{R}/index.html').read()
css=open(f'{R}/css/style.css').read()
h=h.replace('<link rel="stylesheet" href="css/style.css">','<style>\n'+css+'\n</style>')
def inl(m):
    s=open(f'{R}/'+m.group(1),encoding='utf-8').read().replace('</','<\\/')
    return '<script>\n'+s+'\n</script>'
h=re.sub(r'<script src="([^"]+)"></script>',inl,h)
open(f'{R}/dist/model-filter.html','w',encoding='utf-8').write(h)
print(os.path.getsize(f'{R}/dist/model-filter.html'))
