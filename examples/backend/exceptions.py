class ApiException(Exception):
    def __init__(self, msg: str, code: int = 500):
        self.msg = msg
        self.code = code
        super().__init__(msg)
