import sys
import httpx
from pathlib import Path

env_path = Path(__file__).parent / ".env"

def main():
    if len(sys.argv) < 2:
        print("Usage: python exchange_code.py <authorization_code>")
        return
        
    code = sys.argv[1].strip()
    url = "https://accounts.zoho.in/oauth/v2/token"
    
    client_id = "1000.AI72QW074WHA19PR4LXWG4P8KHGE4S"
    client_secret = "454918907c53e8418628807b2d42edec907bf12ecb"
    
    data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code"
    }
    
    print("Exchanging authorization code for tokens...")
    resp = httpx.post(url, data=data)
    print(f"Status Code: {resp.status_code}")
    
    if resp.status_code == 200:
        res_data = resp.json()
        access_token = res_data.get("access_token")
        refresh_token = res_data.get("refresh_token")
        
        if access_token and refresh_token:
            lines = env_path.read_text().splitlines()
            new_lines = []
            for line in lines:
                if line.startswith("ZOHO_ACCESS_TOKEN="):
                    new_lines.append(f"ZOHO_ACCESS_TOKEN={access_token}")
                elif line.startswith("ZOHO_REFRESH_TOKEN="):
                    new_lines.append(f"ZOHO_REFRESH_TOKEN={refresh_token}")
                else:
                    new_lines.append(line)
            env_path.write_text("\n".join(new_lines) + "\n")
            print("Successfully retrieved and saved access_token and refresh_token to .env!")
        else:
            print("Error: Could not retrieve tokens from response.")
            print(res_data)
    else:
        print("Failed to exchange code:")
        print(resp.text)

if __name__ == "__main__":
    main()
