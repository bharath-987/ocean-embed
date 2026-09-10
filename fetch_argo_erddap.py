import urllib.request
import urllib.parse
import ssl

# Target ERDDAP URL for Float #2902282, Cycle 126
url = 'https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.csv?platform_number,cycle_number,time,latitude,longitude,pres,temp&platform_number=~"2902282"&cycle_number=126&distinct()&orderBy("pres")'

# Quote unsafe characters like quotes in the query string if needed
parsed = urllib.parse.urlsplit(url)
safe_query = urllib.parse.quote(parsed.query, safe="=&,~()")
safe_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, safe_query, parsed.fragment))

req = urllib.request.Request(
    safe_url,
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
)

ctx = ssl.create_default_context()

try:
    with urllib.request.urlopen(req, context=ctx, timeout=30) as response:
        content = response.read().decode('utf-8')
        print(content)
except Exception as e:
    # If safe_url failed, try raw URL as fallback
    try:
        req_raw = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req_raw, context=ctx, timeout=30) as response:
            print(response.read().decode('utf-8'))
    except Exception as e2:
        print(f"Error fetching data: {e} (Fallback error: {e2})")
