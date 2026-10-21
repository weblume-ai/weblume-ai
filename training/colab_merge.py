# ===== Weblume Coder - merge LoRA into full-precision base on Colab (CPU runtime is enough) =====
# Result: /content/drive/MyDrive/weblume_model/weblume.gguf  (~4.7 GB, Q4_K_M)
import os, subprocess, glob, shutil
def sh(c):
    print('$', c); r = subprocess.run(c, shell=True)
    if r.returncode: raise SystemExit('FAILED: ' + c)

from google.colab import drive
drive.mount('/content/drive')
D = '/content/drive/MyDrive/weblume_model'
LORA = D + '/weblume-lora.gguf'
assert os.path.exists(LORA), 'weblume-lora.gguf not found in Drive/weblume_model'
W = '/content/w'; os.makedirs(W, exist_ok=True); os.chdir(W)

# 1) build llama.cpp tools
if not os.path.exists('llama.cpp/build/bin/llama-quantize'):
    sh('git clone --depth 1 https://github.com/ggml-org/llama.cpp')
    sh('cmake -S llama.cpp -B llama.cpp/build -DLLAMA_CURL=OFF -DGGML_NATIVE=ON -DCMAKE_BUILD_TYPE=Release >/dev/null')
    sh('cmake --build llama.cpp/build -j --target llama-export-lora llama-quantize llama-completion 2>&1 | tail -3')
    sh('pip -q install -r llama.cpp/requirements/requirements-convert_hf_to_gguf.txt huggingface_hub')
BIN = W + '/llama.cpp/build/bin/'

# 2) full-precision base (same weights as Ollama qwen2.5-coder:7b and as the training base)
if not os.path.exists('base-f16.gguf'):
    sh('hf download Qwen/Qwen2.5-Coder-7B-Instruct --local-dir hf_base || huggingface-cli download Qwen/Qwen2.5-Coder-7B-Instruct --local-dir hf_base')
    sh('python llama.cpp/convert_hf_to_gguf.py hf_base --outtype f16 --outfile base-f16.gguf')
    shutil.rmtree('hf_base', ignore_errors=True)

# 3) merge LoRA in f16, then quantize ONCE to Q4_K_M
sh(f'{BIN}llama-export-lora -m base-f16.gguf --lora "{LORA}" -o merged-f16.gguf -t {os.cpu_count()}')
os.remove('base-f16.gguf')
sh(f'{BIN}llama-quantize merged-f16.gguf weblume.gguf Q4_K_M {os.cpu_count()}')
os.remove('merged-f16.gguf')

# 4) quick style check: should start with "تمام! ده موقع ... كامل في ملف واحد 👇"
SYS = 'اسمك Weblume AI، مساعد شركة Weblume لعمل المواقع. انت مبرمج Full-Stack محترف ومصمم واجهات مبدع، بتتكلم مصري بسيط وودود، والمستخدم ممكن يكون مبتدئ.\n- لو ماحددش لغة برمجة: اكتب موقع HTML واحد كامل فيه CSS وJS، شغال على الموبايل، من غير مكتبات لازمة.\n- التصميم لازم يبقى مبتكر واحترافي: هوية بصرية خاصة بالمشروع، خطوط Google Fonts مميزة، مسافات مريحة، أنيميشن ناعم، وتفاصيل صغيرة تفرق. ممنوع التصميم العادي المكرر.\n- النصوص حقيقية ومقنعة بلغة الموقع، ومن غير Lorem ipsum. العربي RTL.\n- في التعديل: نفّذ المطلوب بالظبط من غير ما تبوّظ باقي الموقع، ورجّع الملف كامل بعد التعديل.\n- اكتب الكود جوه ```html وبعده نقط قصيرة باللي عملته.\n- ماتكتبش أرقام تليفونات من عندك؛ لو مش متاحة حط مكانها واضح للتعديل.'
p = f"<|im_start|>system\n{SYS}<|im_end|>\n<|im_start|>user\nاعملي موقع لمحل حلويات في المعادي<|im_end|>\n<|im_start|>assistant\n"
open('p.txt', 'w').write(p)
subprocess.run(f'{BIN}llama-completion -m weblume.gguf -f p.txt -n 150 --temp 0.3 2>/dev/null', shell=True)

# 5) save to Drive
sh(f'cp weblume.gguf "{D}/weblume.gguf"')
print('\nDONE ->', D + '/weblume.gguf', round(os.path.getsize(D + '/weblume.gguf') / 1e9, 2), 'GB')
