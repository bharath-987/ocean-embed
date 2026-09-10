import sys
import json
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))
import inference as inf
from api_server import extract_surface_inputs

lat, lon, date = 17.947, 92.594, "2021-02-14"
pred = inf.predict_temperature_profile(lat, lon, date)
depths = inf.STANDARD_DEPTHS
temps = [pred[d] for d in depths]
surf = extract_surface_inputs(lat, lon, date)
S_surf = surf["sss"]["val"]

# Load ARGO float ground truth
argo_path = os.path.join(os.path.dirname(__file__), "backend", "data", "argo_profiles.json")
with open(argo_path, "r", encoding="utf-8") as f:
    argo_data = json.load(f)
argo_p = next(p for p in argo_data["profiles"] if p["wmoFloatId"] == 2902282)
argo_temps = argo_p["temperatures"]
argo_sals = argo_p["salinities"]

def mackenzie_6term(T, S, z):
    return 1448.96 + 4.591*T - 5.304e-2*(T**2) + 2.374e-4*(T**3) + 1.340*(S - 35.0) + 1.630e-2*z

def mackenzie_9term(T, S, z):
    return (1448.96 + 4.591*T - 5.304e-2*(T**2) + 2.374e-4*(T**3) + 1.340*(S - 35.0) + 1.630e-2*z
            + 1.675e-7*(z**2) - 1.025e-2*T*(S - 35.0) - 7.139e-13*T*(z**3))

c_code = [round(mackenzie_6term(T, S_surf, z), 2) for z, T in zip(depths, temps)]
c_9term = [round(mackenzie_9term(T, S_surf, z), 2) for z, T in zip(depths, temps)]
c_real_sal = [round(mackenzie_6term(T, S_real, z), 2) for z, T, S_real in zip(depths, temps, argo_sals)]
c_argo_all = [round(mackenzie_6term(T_argo, S_real, z), 2) for z, T_argo, S_real in zip(depths, argo_temps, argo_sals)]

print(f"Float #2902282 | Lat: {lat}, Lon: {lon}, Date: {date}")
print(f"Surface SSS used by Dashboard card: {S_surf} PSU\n")
print(f"{'Depth (m)':<10} | {'AI T (C)':<9} | {'Code c (m/s)':<13} | {'9-term c':<11} | {'ARGO S(PSU)':<12} | {'c (Real S)':<12} | {'c (ARGO T+S)':<12}")
print("-" * 88)
for i in range(15):
    print(f"{depths[i]:<10} | {temps[i]:<9.2f} | {c_code[i]:<13.2f} | {c_9term[i]:<11.2f} | {argo_sals[i]:<12.2f} | {c_real_sal[i]:<12.2f} | {c_argo_all[i]:<12.2f}")

# Finding max in upper 300m:
maxC = c_code[0]
maxIdx = 0
for i in range(1, len(c_code)):
    if depths[i] <= 300 and c_code[i] > maxC:
        maxC = c_code[i]
        maxIdx = i
print(f"\n[Dashboard Card Result]")
print(f"Acoustic Shadow Depth (Sonic Layer Depth): {depths[maxIdx]} m (max c = {maxC} m/s)")
