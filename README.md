# Investment Notes

이미지로 업로드된 기업 리서치 자료를 Claude가 분석·요약하여 카드로 정리하고,
GitHub Pages에 정적 사이트로 공개·검색할 수 있게 해주는 개인 리서치 보관소입니다.

## 작동 방식

1. 사용자가 Cowork(Claude 데스크톱)에 이미지를 업로드하면서 "이 자료 정리해줘" 식으로 요청
2. Claude가 이미지를 읽고 다음을 수행:
   - 어떤 **기업**에 대한 자료인지 식별
   - 이미지 자료의 핵심을 **3-5개 불릿**으로 요약
   - 이미지 파일을 `images/<company-id>/` 아래로 저장
   - `data/companies.json`에 카드 추가
3. Claude가 자동으로 `git add` → `commit` → `push`
4. GitHub Pages가 변경된 사이트를 배포 (보통 1분 내 반영)

## 디렉터리 구조

```
investment-notes/
├── index.html              # 기업 목록 (메인)
├── company.html            # 기업 상세 (카드 목록)
├── assets/
│   ├── style.css
│   ├── app.js              # 목록 페이지 로직
│   └── company.js          # 상세 페이지 로직
├── data/
│   ├── companies.json      # 모든 데이터 (Claude가 편집)
│   └── SCHEMA.md           # 스키마 정의
└── images/<company-id>/    # 업로드된 이미지 보관
```

## Claude에게 시키는 방법 (사용자 매뉴얼)

이미지를 첨부하면서 다음과 같이 요청하세요:

- "이 이미지 investment-notes 리포지토리에 정리해서 푸시해줘"
- "삼성전자 리서치 카드로 추가해줘"
- "이거 새 기업으로 등록해줘. 푸시까지."

Claude는 다음 순서로 처리합니다:

```
1. 이미지 분석 → 기업명 식별
2. companies.json에서 해당 기업 entry 찾기 (없으면 추가)
3. images/<company-id>/<timestamp>.png 로 이미지 저장
4. 새 카드 객체를 cards 배열 끝에 push
5. last_updated 갱신
6. git add -A && git commit -m "..." && git push
```

## 로컬에서 미리 보기

```bash
cd ~/Desktop/Claude/investment-notes
python3 -m http.server 8000
# 브라우저: http://localhost:8000
```

## GitHub Pages 활성화 (최초 1회)

저장소 푸시 후:
1. GitHub 저장소 → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **/(root)**
4. Save → 1-2분 후 `https://<username>.github.io/investment-notes/` 접속

## 데이터 스키마

`data/SCHEMA.md` 참고.

---

자동 생성된 Claude의 작업 도구입니다. JSON을 직접 손으로 수정해도 됩니다.
