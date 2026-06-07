"""
main.py - Giao dien chinh (UI) kieu web cho tro ly giong noi nguoi cao tuoi.

Bo cuc:
  +----------------------------------------------------------+
  | HEADER: Tieu de | Trang thai | Dong ho                    |
  +----------+-----------------------------------------------+
  | SIDEBAR  |  Khung hoi thoai (chat)                       |
  | (nut lon |                                               |
  |  co dinh)|  [O nhap van ban]  [Gui]                      |
  +----------+-----------------------------------------------+

Luong xu ly:
  Voice: STT -> NLP -> Task -> TTS
  Text:  NLP -> Task -> TTS (du phong khi khong dung mic)
"""

import threading
import tkinter as tk
from datetime import datetime
from tkinter import messagebox, simpledialog

import config
from features import MedicationReminder, PhoneController
from nlp_module import NLPProcessor
from stt_module import SpeechToText
from tts_module import TextToSpeech


class AssistantApp:
    """Ung dung chinh: UI kieu web + dieu phoi cac module."""

    def __init__(self, root: tk.Tk):
        self.root = root

        # Khoi tao module xu ly
        self.stt = SpeechToText()
        self.nlp = NLPProcessor()
        self.tts = TextToSpeech()
        self.reminder = MedicationReminder()
        self.phone = PhoneController()

        self._busy = False

        self._build_ui()
        self._update_clock()
        self.reminder.start(on_due=self._on_medication_due)

        # Thong bao khoi dong + trang thai OpenAI
        ai_status = "AI chat enabled" if self.nlp.use_openai else "Rule-based mode"
        self._show_assistant(
            f"Hello! I'm your care assistant. "
            f"Press the green Speak button or type a message below. ({ai_status})"
        )

    # ==================================================================
    #  XAY DUNG GIAO DIEN
    # ==================================================================
    def _build_ui(self):
        self.root.title(config.APP_TITLE)
        self.root.geometry(f"{config.WINDOW_WIDTH}x{config.WINDOW_HEIGHT}")
        self.root.configure(bg=config.COLOR_BG)
        self.root.minsize(900, 620)

        # Dung GRID de kiem soat bo cuc - tranh nut bi day xuong ngoai man hinh
        self.root.grid_rowconfigure(1, weight=1)
        self.root.grid_columnconfigure(1, weight=1)

        self._build_header()
        self._build_sidebar()
        self._build_chat_panel()

        self.root.protocol("WM_DELETE_WINDOW", self._on_exit)

    def _build_header(self):
        """Thanh header phia tren (giong web app)."""
        header = tk.Frame(self.root, bg=config.COLOR_SIDEBAR, height=72)
        header.grid(row=0, column=0, columnspan=2, sticky="ew")
        header.grid_propagate(False)

        tk.Label(header, text="Senior Care Assistant",
                 font=config.FONT_TITLE, bg=config.COLOR_SIDEBAR,
                 fg=config.COLOR_ACCENT).pack(side=tk.LEFT, padx=24, pady=16)

        tk.Label(header, text="Improving Daily Life & Medication Adherence",
                 font=config.FONT_SUBTITLE, bg=config.COLOR_SIDEBAR,
                 fg=config.COLOR_TEXT_MUTED).pack(side=tk.LEFT, pady=16)

        right = tk.Frame(header, bg=config.COLOR_SIDEBAR)
        right.pack(side=tk.RIGHT, padx=24)

        self.clock_var = tk.StringVar()
        tk.Label(right, textvariable=self.clock_var, font=config.FONT_STATUS,
                 bg=config.COLOR_SIDEBAR, fg=config.COLOR_TEXT).pack(anchor=tk.E)

        self.status_var = tk.StringVar(value="Ready")
        tk.Label(right, textvariable=self.status_var, font=config.FONT_STATUS,
                 bg=config.COLOR_SIDEBAR, fg=config.COLOR_ACCENT).pack(anchor=tk.E)

    def _build_sidebar(self):
        """Sidebar trai: cac nut chinh LUON hien thi."""
        sidebar = tk.Frame(self.root, bg=config.COLOR_SIDEBAR, width=config.SIDEBAR_WIDTH)
        sidebar.grid(row=1, column=0, sticky="ns")
        sidebar.grid_propagate(False)

        tk.Label(sidebar, text="Main Menu", font=config.FONT_BUTTON,
                 bg=config.COLOR_SIDEBAR, fg=config.COLOR_TEXT_MUTED).pack(
            anchor=tk.W, padx=20, pady=(20, 8))

        # Cac nut chinh - icon + nhan ro rang
        buttons = [
            ("🎤  Speak", self._on_speak_click, config.COLOR_SPEAK, "speak"),
            ("💊  My Medications", self._open_medications_window, config.COLOR_MED, None),
            ("👥  Contacts", self._open_contacts_window, config.COLOR_CONTACT, None),
            ("⏰  What Time?", self._quick_time, config.COLOR_TIME, None),
            ("💬  Check Medicine", self._quick_medicine, config.COLOR_MED, None),
            ("❓  Help", self._quick_help, config.COLOR_HELP, None),
        ]

        for label, cmd, color, ref in buttons:
            btn = self._make_sidebar_button(sidebar, label, cmd, color)
            btn.pack(fill=tk.X, padx=16, pady=6)
            if ref == "speak":
                self.speak_btn = btn

        # Nut thoat o cuoi sidebar
        tk.Frame(sidebar, bg=config.COLOR_SIDEBAR, height=20).pack(expand=True)
        self._make_sidebar_button(sidebar, "✕  Exit", self._on_exit, config.COLOR_EXIT) \
            .pack(fill=tk.X, padx=16, pady=(6, 20))

    def _build_chat_panel(self):
        """Khu vuc chat ben phai."""
        panel = tk.Frame(self.root, bg=config.COLOR_BG)
        panel.grid(row=1, column=1, sticky="nsew", padx=(0, 16), pady=16)
        panel.grid_rowconfigure(0, weight=1)
        panel.grid_columnconfigure(0, weight=1)

        # The chat (card)
        chat_outer = tk.Frame(panel, bg=config.COLOR_CARD_BORDER, padx=1, pady=1)
        chat_outer.grid(row=0, column=0, sticky="nsew")
        chat_outer.grid_rowconfigure(0, weight=1)
        chat_outer.grid_columnconfigure(0, weight=1)

        chat_inner = tk.Frame(chat_outer, bg=config.COLOR_CARD)
        chat_inner.grid(row=0, column=0, sticky="nsew")
        chat_inner.grid_rowconfigure(0, weight=1)
        chat_inner.grid_columnconfigure(0, weight=1)

        scrollbar = tk.Scrollbar(chat_inner)
        scrollbar.grid(row=0, column=1, sticky="ns")

        self.chat_log = tk.Text(
            chat_inner, font=config.FONT_LOG, wrap=tk.WORD,
            bg=config.COLOR_CARD, fg=config.COLOR_TEXT,
            yscrollcommand=scrollbar.set, padx=20, pady=16,
            relief=tk.FLAT, state=tk.DISABLED, spacing3=10,
            insertbackground=config.COLOR_TEXT,
        )
        self.chat_log.grid(row=0, column=0, sticky="nsew")
        scrollbar.config(command=self.chat_log.yview)

        self.chat_log.tag_config("user_label", foreground=config.COLOR_USER,
                                 font=(config.FONT_FAMILY, 17, "bold"))
        self.chat_log.tag_config("user_text", foreground=config.COLOR_TEXT)
        self.chat_log.tag_config("assistant_label", foreground=config.COLOR_ASSISTANT,
                                 font=(config.FONT_FAMILY, 17, "bold"))
        self.chat_log.tag_config("assistant_text", foreground=config.COLOR_TEXT)
        self.chat_log.tag_config("system", foreground=config.COLOR_TEXT_MUTED,
                                 font=config.FONT_STATUS)

        # O nhap van ban (du phong khi khong dung mic)
        input_frame = tk.Frame(panel, bg=config.COLOR_BG)
        input_frame.grid(row=1, column=0, sticky="ew", pady=(12, 0))
        input_frame.grid_columnconfigure(0, weight=1)

        self.text_input = tk.Entry(
            input_frame, font=config.FONT_INPUT, bg=config.COLOR_INPUT_BG,
            fg=config.COLOR_TEXT, insertbackground=config.COLOR_TEXT,
            relief=tk.FLAT, highlightthickness=2,
            highlightbackground=config.COLOR_CARD_BORDER,
            highlightcolor=config.COLOR_ACCENT,
        )
        self.text_input.grid(row=0, column=0, sticky="ew", ipady=12, padx=(0, 10))
        self.text_input.bind("<Return>", lambda _e: self._on_text_send())
        self.text_input.insert(0, "")
        self.text_input.config(fg=config.COLOR_TEXT)

        send_btn = self._make_action_button(input_frame, "Send", self._on_text_send,
                                            config.COLOR_ACCENT, width=10)
        send_btn.grid(row=0, column=1, sticky="e")

        tk.Label(panel, text="Tip: Try \"Do I need to take medicine?\" or \"Call my daughter\"",
                 font=config.FONT_STATUS, bg=config.COLOR_BG,
                 fg=config.COLOR_TEXT_MUTED).grid(row=2, column=0, sticky="w", pady=(8, 0))

    # ------------------------------------------------------------------
    #  Widget helpers
    # ------------------------------------------------------------------
    def _make_sidebar_button(self, parent, text, command, color):
        """Nut sidebar lon, de bam cho nguoi cao tuoi."""
        btn = tk.Button(
            parent, text=text, command=command,
            font=config.FONT_BUTTON, bg=color, fg="white",
            activebackground=color, activeforeground="white",
            relief=tk.FLAT, cursor="hand2", borderwidth=0,
            padx=12, pady=14, anchor=tk.W,
        )
        # Hieu ung hover don gian
        hover = self._lighten_color(color)
        btn.bind("<Enter>", lambda _e: btn.config(bg=hover))
        btn.bind("<Leave>", lambda _e: btn.config(bg=color))
        return btn

    def _make_action_button(self, parent, text, command, color, width=8):
        btn = tk.Button(
            parent, text=text, command=command, width=width,
            font=config.FONT_BUTTON, bg=color, fg="#0b1220",
            activebackground=color, activeforeground="#0b1220",
            relief=tk.FLAT, cursor="hand2", borderwidth=0, padx=8, pady=10,
        )
        return btn

    @staticmethod
    def _lighten_color(hex_color: str) -> str:
        """Lam sang mau hex nhe de hieu ung hover."""
        hex_color = hex_color.lstrip("#")
        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
        r = min(255, r + 30)
        g = min(255, g + 30)
        b = min(255, b + 30)
        return f"#{r:02x}{g:02x}{b:02x}"

    # ==================================================================
    #  DONG HO (cap nhat moi giay)
    # ==================================================================
    def _update_clock(self):
        now = datetime.now()
        self.clock_var.set(now.strftime("%A, %B %d  •  %I:%M %p"))
        self.root.after(1000, self._update_clock)

    # ==================================================================
    #  HIEN THI HOI THOAI
    # ==================================================================
    def _append_chat(self, speaker: str, text: str, role: str):
        self.chat_log.config(state=tk.NORMAL)
        if role == "user":
            self.chat_log.insert(tk.END, "You\n", "user_label")
            self.chat_log.insert(tk.END, f"{text}\n\n", "user_text")
        elif role == "assistant":
            self.chat_log.insert(tk.END, "Assistant\n", "assistant_label")
            self.chat_log.insert(tk.END, f"{text}\n\n", "assistant_text")
        else:
            self.chat_log.insert(tk.END, f"{text}\n\n", "system")
        self.chat_log.see(tk.END)
        self.chat_log.config(state=tk.DISABLED)

    def _show_user(self, text: str):
        self.root.after(0, self._append_chat, "You", text, "user")

    def _show_assistant(self, text: str):
        self.root.after(0, self._append_chat, "Assistant", text, "assistant")

    def _set_status(self, text: str):
        self.root.after(0, self.status_var.set, text)

    # ==================================================================
    #  XU LY VAN BAN (NLP -> Task -> TTS)
    # ==================================================================
    def _process_user_text(self, text: str):
        """Xu ly cau nguoi dung (tu mic hoac o nhap)."""
        text = text.strip()
        if not text:
            return

        self._show_user(text)
        self._set_status("Thinking...")

        try:
            result = self.nlp.process(text)
            reply = self._handle_intent(result)
            self._show_assistant(reply)
            self._set_status("Ready")
            self._speak_async(reply)
        except Exception as exc:  # noqa: BLE001
            print(f"[MAIN] Loi xu ly: {exc}")
            self._set_status("Something went wrong.")
            self._show_assistant("Sorry, something went wrong. Please try again.")

    def _on_text_send(self):
        """Gui van ban tu o nhap."""
        if self._busy:
            return
        text = self.text_input.get().strip()
        if not text:
            return
        self.text_input.delete(0, tk.END)
        self._process_user_text(text)

    # ==================================================================
    #  NUT SPEAK (STT -> NLP -> Task -> TTS)
    # ==================================================================
    def _on_speak_click(self):
        if self._busy:
            return
        self._busy = True
        self.speak_btn.config(state=tk.DISABLED)
        self._set_status("Listening... please speak now")
        threading.Thread(target=self._voice_pipeline, daemon=True).start()

    def _voice_pipeline(self):
        try:
            text = self.stt.listen()
            if not text:
                self._set_status("I didn't hear you. Please try again.")
                self._speak_async(
                    "Sorry, I didn't hear you clearly. "
                    "Please press Speak and try again, or type your message."
                )
                return
            self._process_user_text(text)
        except Exception as exc:  # noqa: BLE001
            print(f"[MAIN] Loi giong noi: {exc}")
            self._set_status("Something went wrong. Please try again.")
        finally:
            self.root.after(0, self._reset_speak_button)

    def _reset_speak_button(self):
        self._busy = False
        self.speak_btn.config(state=tk.NORMAL)
        if self.status_var.get().startswith("Listening") or self.status_var.get() == "Thinking...":
            self.status_var.set("Ready")

    def _handle_intent(self, result: dict) -> str:
        intent = result.get("intent")
        entity = result.get("entity")

        if intent == "medication":
            return self.reminder.describe_due()
        if intent == "call":
            return self.phone.call(entity)
        if intent == "open_app":
            return self.phone.open_app(entity)
        if intent == "time":
            return f"The time is {datetime.now().strftime('%I:%M %p')}."
        if intent == "date":
            return f"Today is {datetime.now().strftime('%A, %B %d, %Y')}."
        if intent == "exit":
            self.root.after(2500, self._on_exit)
            return result.get("reply") or "Goodbye!"
        return result.get("reply") or "I'm here for you."

    # ==================================================================
    #  NUT NHANH (quick actions)
    # ==================================================================
    def _quick_time(self):
        reply = f"The time is {datetime.now().strftime('%I:%M %p')}."
        self._show_assistant(reply)
        self._speak_async(reply)

    def _quick_medicine(self):
        reply = self.reminder.describe_due()
        self._show_assistant(reply)
        self._speak_async(reply)

    def _quick_help(self):
        reply = (
            "I can remind you to take medicine, tell you the time, "
            "call your family, open apps, and chat with you. "
            "Press Speak or type your message below."
        )
        self._show_assistant(reply)
        self._speak_async(reply)

    # ==================================================================
    #  TTS
    # ==================================================================
    def _speak_async(self, text: str):
        threading.Thread(target=self.tts.speak, args=(text,), daemon=True).start()

    # ==================================================================
    #  NHAC UONG THUOC
    # ==================================================================
    def _on_medication_due(self, med: dict):
        dose = f" ({med['dose']})" if med.get("dose") else ""
        message = f"It is time to take your medicine: {med['name']}{dose}."
        self._show_assistant(message)
        self._speak_async(message)
        self.root.after(0, lambda: messagebox.showinfo("Medication Reminder", message))

    # ==================================================================
    #  CUA SO THUOC
    # ==================================================================
    def _open_medications_window(self):
        win = tk.Toplevel(self.root)
        win.title("My Medications")
        win.geometry("580x540")
        win.configure(bg=config.COLOR_BG)
        win.transient(self.root)

        tk.Label(win, text="💊  My Medications", font=config.FONT_TITLE,
                 bg=config.COLOR_BG, fg=config.COLOR_ACCENT).pack(pady=16)

        listbox = tk.Listbox(
            win, font=config.FONT_LOG, bg=config.COLOR_CARD, fg=config.COLOR_TEXT,
            selectbackground=config.COLOR_ACCENT, height=12, relief=tk.FLAT,
            highlightthickness=1, highlightbackground=config.COLOR_CARD_BORDER,
        )
        listbox.pack(fill=tk.BOTH, expand=True, padx=24, pady=8)

        def refresh():
            listbox.delete(0, tk.END)
            for med in self.reminder.list_medications():
                dose = f"  •  {med['dose']}" if med.get("dose") else ""
                listbox.insert(tk.END, f"  {med['time']}   {med['name']}{dose}")

        def add_med():
            name = simpledialog.askstring("Add Medicine", "Medicine name:", parent=win)
            if not name:
                return
            med_time = simpledialog.askstring(
                "Add Medicine", "Time (HH:MM, 24-hour):", parent=win)
            if not med_time:
                return
            dose = simpledialog.askstring(
                "Add Medicine", "Dose (e.g. 1 tablet):", parent=win) or ""
            if self.reminder.add_medication(name, med_time, dose):
                refresh()
            else:
                messagebox.showerror(
                    "Error", "Invalid time. Please use HH:MM format.", parent=win)

        def remove_med():
            selection = listbox.curselection()
            if not selection:
                messagebox.showinfo("Remove", "Please select a medicine first.", parent=win)
                return
            sorted_list = self.reminder.list_medications()
            target = sorted_list[selection[0]]
            real_index = self.reminder.medications.index(target)
            if self.reminder.remove_medication(real_index):
                refresh()

        btns = tk.Frame(win, bg=config.COLOR_BG)
        btns.pack(fill=tk.X, padx=24, pady=16)
        self._make_action_button(btns, "+ Add", add_med, config.COLOR_SPEAK).pack(
            side=tk.LEFT, expand=True, fill=tk.X, padx=4)
        self._make_action_button(btns, "Remove", remove_med, config.COLOR_EXIT).pack(
            side=tk.LEFT, expand=True, fill=tk.X, padx=4)

        refresh()

    # ==================================================================
    #  CUA SO DANH BA
    # ==================================================================
    def _open_contacts_window(self):
        win = tk.Toplevel(self.root)
        win.title("Contacts")
        win.geometry("540x500")
        win.configure(bg=config.COLOR_BG)
        win.transient(self.root)

        tk.Label(win, text="👥  Contacts", font=config.FONT_TITLE,
                 bg=config.COLOR_BG, fg=config.COLOR_ACCENT).pack(pady=16)

        listbox = tk.Listbox(
            win, font=config.FONT_LOG, bg=config.COLOR_CARD, fg=config.COLOR_TEXT,
            selectbackground=config.COLOR_ACCENT, height=10, relief=tk.FLAT,
            highlightthickness=1, highlightbackground=config.COLOR_CARD_BORDER,
        )
        listbox.pack(fill=tk.BOTH, expand=True, padx=24, pady=8)

        for name, number in self.phone.contacts.items():
            listbox.insert(tk.END, f"  {name.capitalize()}   —   {number}")

        def call_selected():
            selection = listbox.curselection()
            if not selection:
                messagebox.showinfo("Call", "Please select a contact first.", parent=win)
                return
            name = list(self.phone.contacts.keys())[selection[0]]
            reply = self.phone.call(name)
            self._show_assistant(reply)
            self._speak_async(reply)

        btns = tk.Frame(win, bg=config.COLOR_BG)
        btns.pack(fill=tk.X, padx=24, pady=16)
        self._make_action_button(btns, "📞 Call Selected", call_selected, config.COLOR_SPEAK) \
            .pack(fill=tk.X)

    # ==================================================================
    #  THOAT
    # ==================================================================
    def _on_exit(self):
        self.reminder.stop()
        self.root.destroy()


def main():
    root = tk.Tk()
    # Cai dat DPI tren Windows de hien thi ro hon
    try:
        from ctypes import windll
        windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass
    AssistantApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
