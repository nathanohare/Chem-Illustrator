# Makes the structure reader's model pack (File > Import > From PDF / From Picture) from MolScribe
# (Qian et al., J. Chem. Inf. Model. 2023, 63, 1925; MIT licence; github.com/thomas0809/MolScribe).
# Run by .github/workflows/recognition-model.yml, which publishes the pack as a release the app
# downloads the first time it reads a structure. Three ONNX graphs: the encoder (with each decoder
# layer's keys and values for the picture), one decoder step with its key/value cache, and the
# bond reader; their weights are stored as 8-bit numbers, which read as well as the full ones
# (checked on journal and hand-drawn test pictures) at a third of the size.
#
#   python export.py <MolScribe checkpoint> <out dir>
import sys, os
import json, math, torch, torch.nn as nn, torch.nn.functional as F
from molscribe import MolScribe
ckpt, out = sys.argv[1], sys.argv[2]
full = os.path.join(out, 'full')
os.makedirs(full, exist_ok=True)
m = MolScribe(ckpt, device=torch.device('cpu'))
enc = m.encoder.eval()
for layer in enc.transformer.layers: layer.use_checkpoint = False
dec = m.decoder.decoder['chartok_coords'].eval()
edges = m.decoder.decoder['edges'].eval()
tok = m.tokenizer['chartok_coords']
for p in list(enc.parameters()) + list(m.decoder.parameters()): p.requires_grad_(False)
L = dec.decoder.transformer_layers
H = L[0].self_attn.head_count; D = 256; DK = D // H

def heads(x):  # [1,T,D] -> [1,H,T,DK]
    return x.view(1, -1, H, DK).transpose(1, 2)

class Enc(nn.Module):
    def __init__(self):
        super().__init__(); self.e = enc; self.d = dec
    def forward(self, img):
        feats, _ = enc(img)
        mem = dec.enc_transform(feats)
        ck = torch.stack([heads(l.context_attn.linear_keys(mem)) for l in L])
        cv = torch.stack([heads(l.context_attn.linear_values(mem)) for l in L])
        return ck, cv

pe = dec.embeddings.make_embedding.pe.pe[:, 0, :]  # [max_len, D]
word = dec.embeddings.make_embedding.emb_luts[0]

class Step(nn.Module):
    def __init__(self):
        super().__init__(); self.d = dec
    def forward(self, token, pos, pk, pv, ck, cv):
        x = word(token.view(1, 1)) * math.sqrt(D) + pe[pos].view(1, 1, D)
        nk, nv = [], []
        for i, l in enumerate(L):
            a = l.self_attn
            h = l.layer_norm_1(x)
            q = heads(a.linear_query(h)) / math.sqrt(DK)
            k = torch.cat([pk[i], heads(a.linear_keys(h))], 2)
            v = torch.cat([pv[i], heads(a.linear_values(h))], 2)
            nk.append(k); nv.append(v)
            ctx = torch.matmul(torch.softmax(torch.matmul(q, k.transpose(2, 3)), -1), v)
            x = a.final_linear(ctx.transpose(1, 2).reshape(1, 1, D)) + x
            c = l.context_attn
            h = l.layer_norm_2(x)
            q = heads(c.linear_query(h)) / math.sqrt(DK)
            ctx = torch.matmul(torch.softmax(torch.matmul(q, ck[i].transpose(2, 3)), -1), cv[i])
            mid = c.final_linear(ctx.transpose(1, 2).reshape(1, 1, D))
            x = l.feed_forward(mid + x)
        out = dec.decoder.layer_norm(x)
        logp = F.log_softmax(dec.output_layer(out).view(1, -1), -1)
        return logp, out.view(1, D), torch.stack(nk), torch.stack(nv)

class Edges(nn.Module):
    def __init__(self):
        super().__init__(); self.g = edges
    def forward(self, hidden):  # [K, D]
        r = edges(hidden.unsqueeze(0), torch.arange(hidden.size(0)).unsqueeze(0))
        return torch.softmax(r['edges'].squeeze(0).permute(1, 2, 0), -1)  # [K,K,7]

with torch.no_grad():
    img = torch.randn(1, 3, 384, 384)
    torch.onnx.export(Enc(), (img,), f'{full}/encoder.onnx', input_names=['image'], output_names=['ck', 'cv'], opset_version=17)
    ck, cv = Enc()(img)
    pk = torch.zeros(len(L), 1, H, 3, DK)
    torch.onnx.export(Step(), (torch.tensor([1]), torch.tensor(3), pk, pk, ck, cv), f'{full}/step.onnx',
        input_names=['token', 'pos', 'pk', 'pv', 'ck', 'cv'], output_names=['logp', 'hidden', 'nk', 'nv'],
        dynamic_axes={'pk': {3: 't'}, 'pv': {3: 't'}, 'nk': {3: 't1'}, 'nv': {3: 't1'}}, opset_version=17)
    torch.onnx.export(Edges(), (torch.randn(5, D),), f'{full}/edges.onnx', input_names=['hidden'], output_names=['probs'],
        dynamic_axes={'hidden': {0: 'k'}, 'probs': {0: 'k', 1: 'k'}}, opset_version=17)
itos = [tok.itos[i] for i in range(tok.offset)]
json.dump({'itos': itos, 'offset': tok.offset, 'maxx': tok.maxx, 'maxy': tok.maxy, 'special': len(tok.special_tokens),
           'layers': len(L), 'heads': H, 'dk': DK, 'maxLen': 480, 'size': 384}, open(f'{out}/vocab.json', 'w'))
from onnxruntime.quantization import quantize_dynamic, QuantType
for n in ('encoder', 'step', 'edges'):
    quantize_dynamic(f'{full}/{n}.onnx', f'{out}/{n}.onnx', weight_type=QuantType.QInt8, op_types_to_quantize=['MatMul', 'Gemm'])
print('exported', tok.offset, tok.maxx, tok.maxy, len(tok))
