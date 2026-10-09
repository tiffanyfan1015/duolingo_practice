"""CLI orchestration: arguments, interactive credentials, and workflow."""
import argparse
import getpass
import os
from pathlib import Path
import sys
from .api import Client, fetch_words
from .auth import user_id_from_token
from .course import progressed_skills
from .errors import SyncError
from .export import export
from .mapping import probe_units


def main():
    parser = argparse.ArgumentParser(description="匯出目前 Duolingo 課程的已學單字；不修改學習進度。")
    parser.add_argument("--language", choices=["de", "ja"], help="確認目前課程是德文或日文，避免匯入錯誤語言")
    parser.add_argument("--check", action="store_true", help="只檢查目前課程與已學技能，不呼叫單字 API")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "exports")
    parser.add_argument("--map-units", action="store_true", help="逐一查詢已學技能，驗證單元對應（不修改進度）")
    args = parser.parse_args()
    if args.check and args.map_units:
        parser.error("--check 與 --map-units 不能同時使用")
    try:
        token = os.environ.get("DUOLINGO_JWT")
        if not token:
            if not sys.stdin.isatty():
                raise SyncError("請在你自己的互動式 PowerShell 執行工具，以隱藏輸入登入權杖。")
            token = getpass.getpass("Duolingo jwt_token（隱藏輸入，不儲存）：")
        token = token.strip()
        user_id = user_id_from_token(token)
        client = Client(token)
        profile = client.request(f"/2023-05-23/users/{user_id}?fields=currentCourse")
        course = profile.get("currentCourse") if isinstance(profile, dict) else None
        if not isinstance(course, dict):
            raise SyncError("API 沒有回傳 currentCourse。")
        if course.get("learningLanguage") not in ("de", "ja"):
            raise SyncError("目前課程不是德文或日文。請在 Duolingo 切到要匯出的課程。")
        if args.language and course.get("learningLanguage") != args.language:
            raise SyncError(f"目前課程不是 {args.language}，請自行切換課程後再執行。")
        skills = progressed_skills(course)
        print(f"目前課程：{course.get('learningLanguage')}；教學語言：{course.get('fromLanguage')}；已學技能：{len(skills)}")
        if args.check:
            print("檢查完成；尚未驗證單字 API。" if skills else "未找到已學技能；需要確認課程資料格式。")
            return 0 if skills else 1
        words = fetch_words(client, user_id, course, skills)
        if args.map_units:
            report_path = probe_units(client, user_id, course, skills, words, args.output)
            print(f"單元對應驗證報告：{report_path}")
            return 0
        for path in export(args.output, course, words, skills):
            print(f"已儲存：{path}")
        print("原始翻譯已保留；繁中補充、詞形與單元對應尚未處理。")
        return 0
    except SyncError as exc:
        print(f"同步停止：{exc}", file=sys.stderr)
        return 1
    except OSError:
        print("無法寫入匯出資料，請確認目錄權限與磁碟空間。", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n已取消。", file=sys.stderr)
        return 130

