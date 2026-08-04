import json, math

TRACKED = {"AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","GB","NO"}
CONTEXT = {"CH","IS","AL","BA","RS","ME","MK","MD","UA","BY","TR","RU"}
KEEP = TRACKED | CONTEXT

LON_MIN, LON_MAX = -25.0, 45.0
LAT_MIN, LAT_MAX = 34.0, 71.6
W = 900.0

def merc(lat): return math.log(math.tan(math.pi/4 + math.radians(lat)/2))
Y_TOP, Y_BOT = merc(LAT_MAX), merc(LAT_MIN)
K = W / (LON_MAX - LON_MIN)
H = (Y_TOP - Y_BOT) * (180/math.pi) * K  # rough
def project(lon, lat):
    x = (lon - LON_MIN) * K
    y = (Y_TOP - merc(lat)) / (Y_TOP - Y_BOT) * ((Y_TOP - Y_BOT)/( (LON_MAX-LON_MIN)*math.pi/180 )) * W
    return x, y

# Sutherland-Hodgman clip against lon/lat rect
def clip_poly(pts):
    def clip_edge(pts, inside, intersect):
        out=[]
        n=len(pts)
        for i in range(n):
            cur, prv = pts[i], pts[i-1]
            ci, pi = inside(cur), inside(prv)
            if ci:
                if not pi: out.append(intersect(prv,cur))
                out.append(cur)
            elif pi:
                out.append(intersect(prv,cur))
        return out
    def ix_v(x):  # vertical line lon=x
        def f(a,b):
            t=(x-a[0])/(b[0]-a[0]); return (x, a[1]+t*(b[1]-a[1]))
        return f
    def ix_h(y):
        def f(a,b):
            t=(y-a[1])/(b[1]-a[1]); return (a[0]+t*(b[0]-a[0]), y)
        return f
    pts = clip_edge(pts, lambda p: p[0]>=LON_MIN, ix_v(LON_MIN))
    if not pts: return []
    pts = clip_edge(pts, lambda p: p[0]<=LON_MAX, ix_v(LON_MAX))
    if not pts: return []
    pts = clip_edge(pts, lambda p: p[1]>=LAT_MIN, ix_h(LAT_MIN))
    if not pts: return []
    pts = clip_edge(pts, lambda p: p[1]<=LAT_MAX, ix_h(LAT_MAX))
    return pts

def dp(pts, tol):
    if len(pts) < 3: return pts
    # iterative Douglas-Peucker
    keep=[False]*len(pts); keep[0]=keep[-1]=True
    stack=[(0,len(pts)-1)]
    while stack:
        i,j=stack.pop()
        if j<=i+1: continue
        ax,ay=pts[i]; bx,by=pts[j]
        dx,dy=bx-ax,by-ay
        L2=dx*dx+dy*dy
        dmax=-1; idx=-1
        for k in range(i+1,j):
            px,py=pts[k]
            if L2==0: d=math.hypot(px-ax,py-ay)
            else:
                t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/L2))
                d=math.hypot(px-(ax+t*dx), py-(ay+t*dy))
            if d>dmax: dmax=d; idx=k
        if dmax>tol:
            keep[idx]=True; stack.append((i,idx)); stack.append((idx,j))
    return [p for p,k in zip(pts,keep) if k]

def area(pts):
    s=0
    for i in range(len(pts)):
        x1,y1=pts[i]; x2,y2=pts[(i+1)%len(pts)]
        s+=x1*y2-x2*y1
    return abs(s)/2

d = json.load(open('europe.geojson'))
out={}
TOL=1.1
for f in d['features']:
    iso=f['properties']['ISO2']
    if iso not in KEEP: continue
    geom=f['geometry']
    polys = geom['coordinates'] if geom['type']=='MultiPolygon' else [geom['coordinates']]
    projected=[]
    for poly in polys:
        ring=poly[0]  # outer ring only
        ring=clip_poly([(p[0],p[1]) for p in ring])
        if len(ring)<3: continue
        pts=[project(lo,la) for lo,la in ring]
        pts=dp(pts,TOL)
        if len(pts)<3: continue
        a=area(pts)
        projected.append((a,pts))
    if not projected: continue
    projected.sort(key=lambda t:-t[0])
    # keep polygons: largest always; others if area>6 (px^2); cap count for context countries
    kept=[]
    for i,(a,pts) in enumerate(projected):
        if i==0 or a>2.2:
            kept.append(pts)
    maxparts = 40 if iso in TRACKED else 24
    kept=kept[:maxparts]
    path=""
    for pts in kept:
        path+="M"+" ".join(f"{x:.1f} {y:.1f}" for x,y in pts)+"Z"
    out[iso]=path

# viewbox height from projection of LAT_MIN
_,ymax = project(0, LAT_MIN)
result={"viewBox": f"0 0 900 {ymax:.0f}", "paths": out}
js="const MAP_DATA = "+json.dumps(result, separators=(',',':'))+";"
open('map_data.js','w').write(js)
import os
print("countries:",len(out), "| size:", os.path.getsize('map_data.js'), "bytes | viewBox:", result['viewBox'])
for iso in sorted(TRACKED):
    print(iso, "OK len="+str(len(out.get(iso,''))) if iso in out else "MISSING")
