"""Write trained networks (train_net.py .pt files) as public/nmr/nmr-net.dat for src/chem/nmr/net.ts.

Usage: python3 -I scripts/nmr/export_net.py OUT.dat [--blend blend.json] net-1.pt [net-2.pt ...]

--blend embeds blend_tune.py's report: per nucleus, how the lookup and the networks are weighted
and the error bar calibration, read by src/chem/nmr/net.ts.

Layout: 'NMRN', u32 version, u32 header length, JSON header {models: [{hidden, layers,
tensors: [{name, shape, offset}]}], norm, solvents}, padding to 8, then float16 values
(row-major, as torch stores them) for every tensor, each padded to 8 bytes."""
import json
import struct
import sys

import numpy as np
import torch

NORM = {'13C': (100.0, 50.0), '1H': (4.0, 2.5)}
SOLVENTS = ['CDCl3', 'DMSO-d6', 'CD3OD', 'C6D6', 'acetone-d6', 'CD2Cl2', 'CD3CN', 'D2O']


def main():
    out, paths = sys.argv[1], sys.argv[2:]
    blend = None
    if paths and paths[0] == '--blend':
        rep = json.load(open(paths[1]))
        blend = {n: {**rep[n]['params'], **({'calib': rep[n]['calib']} if 'calib' in rep[n] else {})} for n in ('13C', '1H')}
        paths = paths[2:]
    models, blobs, off = [], [], 0
    for p in paths:
        ck = torch.load(p, map_location='cpu')
        tens = []
        for name, t in ck['state'].items():
            a = t.detach().numpy().astype('<f2')
            b = a.tobytes()
            b += b'\0' * (-len(b) % 8)
            tens.append({'name': name, 'shape': list(a.shape), 'offset': off})
            blobs.append(b)
            off += len(b)
        models.append({'hidden': ck['hidden'], 'layers': ck['layers'], 'tensors': tens})
    head = json.dumps({'version': 1, 'models': models, 'norm': NORM, 'solvents': SOLVENTS, 'blend': blend}).encode()
    pre = b'NMRN' + struct.pack('<II', 1, len(head)) + head
    pre += b'\0' * (-len(pre) % 8)
    with open(out, 'wb') as f:
        f.write(pre)
        for b in blobs:
            f.write(b)
    print(json.dumps({'models': len(models), 'bytes': len(pre) + off}))


if __name__ == '__main__':
    main()
