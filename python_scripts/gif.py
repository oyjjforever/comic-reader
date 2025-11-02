import os
import imageio.v2 as imageio
import logging
import sys
import shutil

logging.basicConfig(level=logging.ERROR, format='%(levelname)s: %(message)s')

def downLoadGif(file_path=".",file_name="output.gif",fps=60):
    
    # 检查目录是否存在
    if not os.path.exists(file_path):
        logging.error(f"Directory {file_path} does not exist!")
        sys.exit(1)
    
    # 获取目录中的所有文件
    all_files = os.listdir(file_path)
    
    # 过滤出文件（排除子目录），并构建完整路径
    temp_file_list = [
        os.path.join(file_path, filename) 
        for filename in all_files 
        if os.path.isfile(os.path.join(file_path, filename))
    ]
    
    # 按文件名排序（确保顺序正确）
    temp_file_list.sort()
    
    logging.info(f"Found {len(temp_file_list)} files: {temp_file_list}")
    
    # 如果没有找到文件，直接返回
    if not temp_file_list:
        logging.error("No files found to create GIF!")
        sys.exit(1)
    
    image_data = []
    for file in temp_file_list:
        try:
            image_data.append(imageio.imread(file))
        except Exception as e:
            logging.error(f"Error reading file {file}: {e}")
    
    # 如果有图片数据，则创建GIF
    if image_data:
        output_path = os.path.join(file_path, "../"+file_name)
        imageio.mimsave(output_path, image_data, "mp4", fps=fps)
        logging.info(f"GIF saved to {output_path}")
        shutil.rmtree(file_path)
    else:
        logging.error("No valid image files found!")
        sys.exit(1)

if __name__ == "__main__":
    # 从命令行参数获取 file_path，如果没有参数则使用默认值 '.'
    file_path = sys.argv[1]
    file_name = sys.argv[2]
    fps = float(sys.argv[3])
    downLoadGif(file_path,file_name,fps)
    print("GIF generated successfully!")